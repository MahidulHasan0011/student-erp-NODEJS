import type { Processor } from 'bullmq';
import { createWorker } from '../services/queue.service.js';
import { rollEngine } from '../core/roll.engine.js';
import { cacheService } from '../services/cache.service.js';
import type { RollJobData, RollJobResult } from '../queues/job.types.js';

// ranking.job.js sends jobs to this queue (with rankedList) — here the actual roll_number is assigned,
// history is saved, and the ranking is locked (roll.engine does it all in a single transaction)
const processor: Processor<RollJobData, RollJobResult> = async (job) => {
  const { rankedList, classId, academicSessionId, sectionId, lockedBy } = job.data;

  console.log(`[roll.job] assigning rolls for class=${classId} session=${academicSessionId}`);

  const { results, version } = await rollEngine.generateRolls({
    rankedList,
    classId,
    academicSessionId,
    sectionId,
    lockedBy,
  });

  // a new snapshot was created → remove the stale current-ranking cache
  await cacheService.del(`ranking:current:${classId}:${academicSessionId}`);

  return { assignedCount: results.length, version };
};

// Listens to the queue named "roll"
export const rollWorker = createWorker<RollJobData, RollJobResult>('roll', processor);
