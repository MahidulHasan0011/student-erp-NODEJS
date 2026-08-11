import type { Processor } from 'bullmq';
import { createWorker } from '../services/queue.service.js';
import { rankingEngine } from '../core/ranking.engine.js';
import { enqueueRollJob } from '../queues/roll.queue.js';
import type { RankingJobData, RankingJobResult } from '../queues/job.types.js';

// This processor runs when a job arrives from the queue — the actual calculation is done by core/ranking.engine.js
const processor: Processor<RankingJobData, RankingJobResult> = async (job) => {
  const {
    classId,
    academicSessionId,
    admissionTestEnabled,
    sectionId,
    triggeredBy,
    allowWhenLocked,
  } = job.data;

  console.log(`[ranking.job] processing class=${classId} session=${academicSessionId}`);

  const rankedList = await rankingEngine.buildCombinedRanking({
    classId,
    academicSessionId,
    admissionTestEnabled,
    allowWhenLocked, // true when it comes from the RECALCULATE_RANKING flow (step 6)
  });

  // ranking done — send the next step to roll.queue (sequential chain), passing lockedBy along too
  await enqueueRollJob({
    rankedList,
    classId,
    academicSessionId,
    sectionId,
    lockedBy: triggeredBy,
  });

  return { rankedCount: rankedList.length };
};

// Listens to the queue named "ranking" — started by server.js or a separate worker process
export const rankingWorker = createWorker<RankingJobData, RankingJobResult>('ranking', processor);
