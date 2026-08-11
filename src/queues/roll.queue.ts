import type { Job } from 'bullmq';
import { createQueue, addJob } from '../services/queue.service.js';
import type { RollJobData, RollJobResult } from './job.types.js';

export const rollQueue = createQueue<RollJobData, RollJobResult>('roll');

// Triggered after the ranking job finishes
// data = { rankedList, classId, academicSessionId, sectionId }
export const enqueueRollJob = (data: RollJobData): Promise<Job<RollJobData>> => {
  return addJob(rollQueue, 'generate-roll', data);
};
