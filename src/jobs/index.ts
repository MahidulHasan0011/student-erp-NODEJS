// ── Worker bootstrap ──
// Importing this file starts the ranking + roll workers and they begin listening to the queue.
// server.ts imports it (same process), or if preferred it can be run as a separate worker process
// via `tsx src/jobs/index.ts` (to scale independently from the API in production).
import { rankingWorker } from './ranking.job.js';
import { rollWorker } from './roll.job.js';

console.log('[workers] ranking + roll workers started');

export { rankingWorker, rollWorker };
