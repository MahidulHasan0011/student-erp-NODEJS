import type { RankedEntry } from '../core/roll.engine.js';

// ─────────────────────────────────────────────────────────────────────────────
// Job payloads for the ranking → roll chain.
//
// These live here rather than in either queue file because both sides need them: the
// producer (queues/*.ts) and the consumer (jobs/*.ts). Declaring the shape once is what
// makes the two ends checkable against each other — previously a renamed field in the
// enqueue call would only surface as `undefined` inside the worker at runtime.
//
// ── A payload must survive a JSON round-trip ──
// BullMQ stores job data in Redis as JSON, so anything that goes in comes back parsed:
// a Date becomes an ISO string, undefined disappears. Every field declared below is
// JSON-safe; the extra columns carried inside rankedList are typed `unknown` by
// RankedEntry's index signature, which is honest about that conversion.
// ─────────────────────────────────────────────────────────────────────────────

export interface RankingJobData {
  classId: string;
  academicSessionId: string;
  /** null = distribute across the class's sections rather than a fixed one */
  sectionId: string | null;
  admissionTestEnabled: boolean;
  /** null = triggered by the system (auto-trigger after publish), not a user */
  triggeredBy: string | null;
  /** only the RECALCULATE_RANKING flow sets this */
  allowWhenLocked?: boolean;
}

export interface RankingJobResult {
  rankedCount: number;
}

export interface RollJobData {
  /** the ordered list ranking.engine produced — every entry has a rank_position */
  rankedList: RankedEntry[];
  classId: string;
  academicSessionId: string;
  sectionId: string | null;
  lockedBy: string | null;
}

export interface RollJobResult {
  assignedCount: number;
  /** the ranking_history version this run wrote */
  version: number;
}
