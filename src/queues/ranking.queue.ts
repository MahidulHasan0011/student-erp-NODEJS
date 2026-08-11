import type { Job } from 'bullmq';
import { createQueue, addJob } from '../services/queue.service.js';
import type { RankingJobData, RankingJobResult } from './job.types.js';

export const rankingQueue = createQueue<RankingJobData, RankingJobResult>('ranking');
// Called from a controller/service to schedule a ranking job
// data = { classId, academicSessionId, admissionTestEnabled, ... }
// jobId is deterministic — guards against duplicate jobs for the same class+session (double-click / duplicate event).
// BullMQ silently drops a second job with the same jobId (while it's still in the queue).
// allowWhenLocked (recalc flow) gets a separate jobId so it doesn't collide with the normal trigger.
export const enqueueRankingJob = (data: RankingJobData): Promise<Job<RankingJobData>> => {
  const suffix = data.allowWhenLocked ? 'recalc' : 'auto';
  const jobId = `ranking:${data.classId}:${data.academicSessionId}:${suffix}`;
  return addJob(rankingQueue, 'calculate-ranking', data, { jobId });
};
