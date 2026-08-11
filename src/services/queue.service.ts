import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions, Job, JobsOptions, Processor, WorkerOptions } from 'bullmq';
import { env } from '../config/env.js';

// Redis connection config for BullMQ — separate from redisClient (which is node-redis, not ioredis);
// BullMQ builds its own connection from these options

const connection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
};

// ── Retry backoff tuning (env-configurable, tune in prod without touching code) ──
const BACKOFF_BASE_MS = env.QUEUE_BACKOFF_BASE_MS; // first retry ~2s
const BACKOFF_CAP_MS = env.QUEUE_BACKOFF_CAP_MS; // never wait longer than this between retries

// Exponential backoff WITH "equal jitter" (AWS recipe).
// Plain exponential retries every failed job at the exact same instant (2s, 4s, 8s...),
// so a burst of failures keeps retrying in synchronized waves — a "thundering herd" that
// re-hammers a recovering DB/Redis. Jitter spreads the retries randomly across the window.
//
// equal jitter: half the delay is fixed (guaranteed breathing room) + half is random spread.
//   attemptsMade starts at 1 on the first failure.
const jitteredBackoff = (attemptsMade: number): number => {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (attemptsMade - 1));
  const half = exp / 2;
  return Math.round(half + Math.random() * half);
};

// Single place for creating a queue — used by queues/*.js
// TData is the job payload; declare it at the call site (queues/roll.queue) so both the
// producer and the worker are checked against the same shape.
export const createQueue = <TData = unknown, TResult = unknown>(
  name: string,
): Queue<TData, TResult> => {
  return new Queue<TData, TResult>(name, { connection });
};

// Single place for creating a worker — used by jobs/*.js
// processor = (job) => {...} — does the actual work using job.data
// settings.backoffStrategy registers the custom strategy referenced by addJob's
// backoff: { type: 'custom' }. It must live on the worker (the worker computes the delay).
export const createWorker = <TData = unknown, TResult = unknown>(
  name: string,
  processor: Processor<TData, TResult>,
  options: Partial<WorkerOptions> = {},
): Worker<TData, TResult> => {
  const { settings, ...rest } = options;
  const worker = new Worker<TData, TResult>(name, processor, {
    connection,
    settings: {
      backoffStrategy: (attemptsMade: number) => jitteredBackoff(attemptsMade),
      ...settings,
    },
    ...rest,
  });
  worker.on('completed', (job) => {
    console.log(`[${name}] job ${job.id} completed`);
  });
  // BullMQ types `job` as possibly undefined here — it is absent when a job fails before
  // it could be fetched back from Redis. The previous `job.id` would itself have thrown
  // inside the listener in that case, so this reads it optionally.
  worker.on('failed', (job, err) => {
    console.error(`[${name}] job ${job?.id} failed:`, err);
  });
  return worker;
};

/**
 * The slice of Queue that addJob actually needs.
 *
 * Queue types its `name` parameter as ExtractNameType<TData, …>, a conditional that
 * TypeScript cannot resolve while TData is still an unbound type parameter — so calling
 * queue.add() from inside a generic helper does not compile. Depending on this minimal
 * shape keeps the payload type checked, and a real Queue<TData> satisfies it.
 */
interface Enqueueable<TData> {
  add(name: string, data: TData, opts?: JobsOptions): Promise<Job<TData>>;
}

// General helper to send a job to a queue
export const addJob = async <TData>(
  queue: Enqueueable<TData>,
  jobName: string,
  data: TData,
  opts: JobsOptions = {},
): Promise<Job<TData>> => {
  return queue.add(jobName, data, {
    attempts: 3, // retry 3 times on failure
    // 'custom' → runs the backoffStrategy registered on the worker (exponential + jitter)
    backoff: { type: 'custom' },
    removeOnComplete: 500, // keep the last 500 completed jobs, remove older ones from the queue
    ...opts,
  });
};
