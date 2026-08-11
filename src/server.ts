import app from './app.js';
import { env } from './config/env.js';
import pool from './config/db.js';
import redisClient from './config/redis.js';

// Redis connect — top-level await works because package.json has "type": "module"
await redisClient.connect();

// Start the BullMQ workers (in the same process) — without this, jobs get enqueued but nobody processes them.
// In production this import can be removed and run as a separate worker process instead.
await import('./jobs/index.js');

const server = app.listen(env.PORT, () => {
  console.log(`\n Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  console.log(` Health: http://localhost:${env.PORT}/health`);
  console.log(` API:    http://localhost:${env.PORT}/api/v1\n`);
});

// Graceful shutdown
//
// The `void` markers and the IIFE are not cosmetic: server.close() and process.on()
// both expect a void-returning callback, so handing them an async function meant the
// returned promise was dropped on the floor. Same shutdown sequence, but the fact that
// nothing awaits it is now stated rather than accidental.
const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    void (async () => {
      await pool.end();
      console.log('DB pool closed. Bye!');
      process.exit(0);
    })();
  });
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Unhandled rejections
process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection at:', reason);
  void shutdown('UNHANDLED_REJECTION');
});
