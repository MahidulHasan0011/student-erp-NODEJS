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
const shutdown = async (signal: string): Promise<void> => {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    console.log('DB pool closed. Bye!');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled rejections
process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection at:', reason);
  shutdown('UNHANDLED_REJECTION');
});
