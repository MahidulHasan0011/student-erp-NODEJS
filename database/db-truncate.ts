import dotenv from 'dotenv';
dotenv.config();
import { Client } from 'pg';
import { env } from '../src/config/env.js';

// Foreign key dependency অনুযায়ী reverse order — child table আগে truncate
const TABLES = [
  'ranking_history',
  'ranking_locks',
  'exam_results',
  'exams',
  'student_attendance',
  'attendance_logs',
  'leaves',
  'student_enrollments',
  'subject_assignments',
  'students',
  'teachers',
  'sections',
  'classes',
  'subjects',
  'academic_sessions',
  'role_permissions',
  'users',
  'roles',
  'permissions',
  'fee_structures',
];

const main = async (): Promise<void> => {
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL not found');
    process.exit(1);
  }
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // CASCADE দিয়ে truncate করলে FK constraint নিয়ে চিন্তা করতে হয় না
    const tableList = TABLES.join(', ');
    console.log(`Truncating ${TABLES.length} tables...`);

    await client.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
    console.log('All tables truncated successfully!\n');
  } catch (err) {
    console.error('Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
};

main();
