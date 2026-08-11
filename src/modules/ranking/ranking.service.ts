import { academicSessionRepository } from '../academic-sessions/academic-session.repository.js';
import { classRepository } from '../classes/class.repository.js';
import { examRepository } from '../exams/exam.repository.js';
import { rankingLockRepository } from '../ranking-locks/ranking-lock.repository.js';
import { AppError } from '../../utils/appError.js';
import { enqueueRankingJob } from '../../queues/ranking.queue.js';
import {
  rankingRepository,
  type AuditLogEntry,
  type RankingSnapshotRow,
  type RankingVersionRow,
} from './ranking.repository.js';
import { cacheService } from '../../services/cache.service.js';
import { assertUuid } from '../../utils/validators.js';
import type {
  AcademicSessionRow,
  ClassRow,
  ExamType,
  RankingLockRow,
} from '../../types/db.types.js';

export interface TriggerRankingInput {
  classId: string;
  academicSessionId: string;
  sectionId?: string | null;
  triggeredBy?: string | null;
}

export interface AutoTriggerInput {
  classId: string | null;
  academicSessionId: string | null;
  examType: ExamType;
}

export interface UnlockInput {
  classId: string;
  academicSessionId: string;
  triggeredBy?: string | null;
}

export interface QueuedJobResult {
  jobId: string | undefined;
  status: string;
}

export interface RecalculateResult extends QueuedJobResult {
  fromVersion: number | null;
}

export interface RankingHistoryResult {
  versions: RankingVersionRow[];
  snapshots: RankingSnapshotRow[];
}

const CURRENT_TTL = 60 * 60; // current ranking cache 1 hour
const currentKey = (classId: string, sessionId: string): string =>
  `ranking:current:${classId}:${sessionId}`;

// validates that class+session are valid and returns both (needed repeatedly)
const loadClassAndSession = async (
  classId: string,
  academicSessionId: string,
): Promise<{ cls: ClassRow; session: AcademicSessionRow }> => {
  if (!classId || !academicSessionId) {
    throw new AppError('classId and academicSessionId are required', 400);
  }
  const cls = await classRepository.findById(classId);
  if (!cls) throw new AppError('Class not found', 404);
  const session = await academicSessionRepository.findById(academicSessionId);
  if (!session) throw new AppError('Academic session not found', 404);
  return { cls, session };
};

// checks whether FINAL (+ ADMISSION, if admission is enabled) is PUBLISHED
// when throwOnMissing=false it returns just a boolean instead of throwing (for auto-trigger)
const checkResultsReady = async (
  classId: string,
  academicSessionId: string,
  admissionTestEnabled: boolean,
  throwOnMissing = true,
): Promise<boolean> => {
  const finalExam = await examRepository.findByClassSessionAndType(
    classId,
    academicSessionId,
    'FINAL',
  );
  if (!finalExam || finalExam.status !== 'PUBLISHED') {
    if (throwOnMissing) {
      throw new AppError('FINAL exam results must be published before generating ranking', 400);
    }
    return false;
  }

  if (admissionTestEnabled) {
    const admissionExam = await examRepository.findByClassSessionAndType(
      classId,
      academicSessionId,
      'ADMISSION',
    );
    if (!admissionExam || admissionExam.status !== 'PUBLISHED') {
      if (throwOnMissing) {
        throw new AppError(
          'ADMISSION exam results must be published before generating ranking',
          400,
        );
      }
      return false;
    }
  }
  return true;
};

export const rankingService = {
  // ── Manual "Generate Roll" button (runs once; blocked if already locked) ──
  async triggerRankingAndRoll({
    classId,
    academicSessionId,
    sectionId,
    triggeredBy,
  }: TriggerRankingInput): Promise<QueuedJobResult> {
    classId = assertUuid(classId, 'classId');
    academicSessionId = assertUuid(academicSessionId, 'academicSessionId');
    sectionId = assertUuid(sectionId, 'sectionId', { required: false });
    triggeredBy = assertUuid(triggeredBy, 'triggeredBy', { required: false });

    const { session } = await loadClassAndSession(classId, academicSessionId);

    const locked = await rankingLockRepository.isLocked(classId, academicSessionId);
    if (locked) {
      throw new AppError(
        'Ranking is already locked for this class & session. Use the recalculate endpoint to regenerate.',
        409,
      );
    }

    await checkResultsReady(classId, academicSessionId, session.admission_test_enabled, true);

    const job = await enqueueRankingJob({
      classId,
      academicSessionId,
      sectionId: sectionId || null,
      admissionTestEnabled: session.admission_test_enabled,
      triggeredBy: triggeredBy || null,
    });

    return { jobId: job.id, status: 'queued' };
  },

  // ── Auto-trigger — called from exam.service after an exam is published ──
  // never throws (the publish flow must not break). If conditions aren't met or it's locked, it silently skips,
  // recording that in the audit log too. It only makes sense to call this on a FINAL/ADMISSION publish.
  async autoTriggerAfterPublish({
    classId,
    academicSessionId,
    examType,
  }: AutoTriggerInput): Promise<void> {
    try {
      if (!classId || !academicSessionId) return;

      const session = await academicSessionRepository.findById(academicSessionId);
      if (!session) return;

      // auto-recalculation is not allowed when locked (documented rule) — skip + log
      if (await rankingLockRepository.isLocked(classId, academicSessionId)) {
        await rankingRepository.logAudit({
          action: 'AUTO_TRIGGER_SKIP',
          classId,
          academicSessionId,
          detail: { reason: 'locked', examType },
        });
        return;
      }

      const ready = await checkResultsReady(
        classId,
        academicSessionId,
        session.admission_test_enabled,
        false,
      );
      if (!ready) {
        await rankingRepository.logAudit({
          action: 'AUTO_TRIGGER_SKIP',
          classId,
          academicSessionId,
          detail: { reason: 'results_not_ready', examType },
        });
        return;
      }

      await enqueueRankingJob({
        classId,
        academicSessionId,
        sectionId: null,
        admissionTestEnabled: session.admission_test_enabled,
        triggeredBy: null, // system trigger
      });

      await rankingRepository.logAudit({
        action: 'AUTO_TRIGGER',
        classId,
        academicSessionId,
        detail: { examType },
      });
    } catch (err) {
      // never throw on the auto path — just log
      console.error('[ranking.autoTrigger] failed:', err instanceof Error ? err.message : err);
    }
  },

  // ── RECALCULATE_RANKING (admin only) ──
  // 1. unlock → 2.3.4. job with allowWhenLocked:true does recalc+regenerate+history → 5. re-lock when the job finishes
  async recalculate({
    classId,
    academicSessionId,
    sectionId,
    triggeredBy,
  }: TriggerRankingInput): Promise<RecalculateResult> {
    classId = assertUuid(classId, 'classId');
    academicSessionId = assertUuid(academicSessionId, 'academicSessionId');
    sectionId = assertUuid(sectionId, 'sectionId', { required: false });
    triggeredBy = assertUuid(triggeredBy, 'triggeredBy', { required: false });

    const { session } = await loadClassAndSession(classId, academicSessionId);

    await checkResultsReady(classId, academicSessionId, session.admission_test_enabled, true);

    const before = await rankingLockRepository.findByClassAndSession(classId, academicSessionId);
    const fromVersion =
      (await rankingRepository.getVersions(classId, academicSessionId))[0]?.version ?? null;

    // step 1 — explicit unlock
    await rankingLockRepository.unlock(classId, academicSessionId);
    await rankingRepository.logAudit({
      action: 'UNLOCK',
      classId,
      academicSessionId,
      actorId: triggeredBy || null,
      fromVersion,
      detail: { context: 'recalculate', wasLocked: before?.is_locked ?? false },
    });

    // steps 2–5 — background job (allowWhenLocked isn't strictly needed since we already unlocked,
    // but we pass it so a concurrent lock during the job doesn't block it in a race)
    const job = await enqueueRankingJob({
      classId,
      academicSessionId,
      sectionId: sectionId || null,
      admissionTestEnabled: session.admission_test_enabled,
      triggeredBy: triggeredBy || null,
      allowWhenLocked: true,
    });

    // clear the stale cache — roll.job will invalidate again after the new snapshot job finishes
    await cacheService.del(currentKey(classId, academicSessionId));

    return { jobId: job.id, status: 'recalculating', fromVersion };
  },

  // ── unlock only (without regenerate) — for when an admin wants to edit manually ──
  async unlock({ classId, academicSessionId, triggeredBy }: UnlockInput): Promise<RankingLockRow> {
    classId = assertUuid(classId, 'classId');
    academicSessionId = assertUuid(academicSessionId, 'academicSessionId');
    triggeredBy = assertUuid(triggeredBy, 'triggeredBy', { required: false });

    await loadClassAndSession(classId, academicSessionId);
    const result = await rankingLockRepository.unlock(classId, academicSessionId);
    await rankingRepository.logAudit({
      action: 'UNLOCK',
      classId,
      academicSessionId,
      actorId: triggeredBy || null,
      detail: { context: 'manual_unlock' },
    });
    return result;
  },

  // ── Read: current ranking (cache-first) ──
  async getRanking(classId: string, academicSessionId: string): Promise<RankingSnapshotRow[]> {
    classId = assertUuid(classId, 'classId');
    academicSessionId = assertUuid(academicSessionId, 'academicSessionId');

    await loadClassAndSession(classId, academicSessionId);

    const key = currentKey(classId, academicSessionId);
    const cached = await cacheService.get<RankingSnapshotRow[]>(key);
    if (cached) return cached;

    const data = await rankingRepository.getCurrentRanking(classId, academicSessionId);
    if (data.length) await cacheService.set(key, data, CURRENT_TTL);
    return data;
  },

  async getHistory(
    classId: string,
    academicSessionId: string,
    version?: unknown,
  ): Promise<RankingHistoryResult> {
    classId = assertUuid(classId, 'classId');
    academicSessionId = assertUuid(academicSessionId, 'academicSessionId');

    await loadClassAndSession(classId, academicSessionId);
    const v = version != null && version !== '' ? Number(version) : null;
    const [snapshots, versions] = await Promise.all([
      rankingRepository.getHistory(classId, academicSessionId, v),
      rankingRepository.getVersions(classId, academicSessionId),
    ]);
    return { versions, snapshots };
  },

  async getAuditLog(classId: string, academicSessionId: string): Promise<AuditLogEntry[]> {
    classId = assertUuid(classId, 'classId');
    academicSessionId = assertUuid(academicSessionId, 'academicSessionId');

    await loadClassAndSession(classId, academicSessionId);
    return rankingRepository.getAuditLog(classId, academicSessionId);
  },
};
