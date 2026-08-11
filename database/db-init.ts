import dotenv from 'dotenv';
dotenv.config();

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../src/config/env.js';

// ESM-এ __dirname নেই — এভাবে বানাতে হয়
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// SQL কে statement-এ ভাঙে, কিন্তু dollar-quote ($$...$$), single-quote string,
// এবং comment-এর ভিতরের ';' কে আলাদা করে না — তাই DO $$ ... $$ block নিরাপদ থাকে
const splitStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  let dollarTag: string | null = null; // চলমান dollar-quote tag, যেমন "$$" বা "$body$"
  let inSingle = false; // '...' string-এর ভিতরে আছি কি না
  let inLineComment = false; // -- comment
  let inBlockComment = false; // /* */ comment

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
      } else i++;
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        current += ch;
        i++;
      }
      continue;
    }
    if (inSingle) {
      current += ch;
      if (ch === "'") {
        if (next === "'") {
          current += next;
          i += 2;
          continue;
        } // '' = escaped quote
        inSingle = false;
      }
      i++;
      continue;
    }

    // কোনো special state-এ নেই
    if (ch === '-' && next === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '$') {
      const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        dollarTag = m[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  const last = current.trim();
  if (last.length > 0) statements.push(last);
  return statements;
};

const runFile = async (client: Client, filename: string): Promise<void> => {
  const filePath = path.join(__dirname, filename);
  const sql = fs.readFileSync(filePath, 'utf8'); // ← utf8 explicitly

  // dollar-quote ও comment বুঝে statement আলাদা করো
  const statements = splitStatements(sql);

  console.log(`Running ${filename}... (${statements.length} statements)`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await client.query(stmt);
    } catch (err) {
      console.error(`\nFailed at statement ${i + 1}:`);
      console.error(stmt.substring(0, 150)); // প্রথম ১৫০ char দেখাও
      throw err;
    }
  }
  console.log(`${filename} done!`);
};

// views/ folder-এর সব .sql file একটা একটা করে রান করে
const runViewsFolder = async (client: Client): Promise<void> => {
  const viewsDir = path.join(__dirname, 'views');
  if (!fs.existsSync(viewsDir)) {
    console.log('views/ folder নেই, skip করা হলো');
    return;
  }

  const files = fs.readdirSync(viewsDir).filter((f) => f.endsWith('.sql'));
  console.log(`Running views/ (${files.length} files)...`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(viewsDir, file), 'utf8');
    const statements = splitStatements(sql);

    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (err) {
        console.error(`\nFailed in ${file}:`);
        console.error(stmt.substring(0, 150));
        throw err;
      }
    }
    console.log(`  ✓ ${file}`);
  }
  console.log('views done!');
};

// migrations/ folder-এর সব .sql file ক্রমানুসারে (নম্বর অনুযায়ী) রান করে
const runMigrationsFolder = async (client: Client): Promise<void> => {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.log('migrations/ folder নেই, skip করা হলো');
    return;
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  console.log(`Running migrations/ (${files.length} files)...`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const statements = splitStatements(sql);

    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (err) {
        console.error(`\nFailed in ${file}:`);
        console.error(stmt.substring(0, 150));
        throw err;
      }
    }
    console.log(`  ✓ ${file}`);
  }
  console.log('migrations done!');
};

const main = async (): Promise<void> => {
  const arg = process.argv[2]; // "schema" | "seed" | "all"

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
    // set the encoding immediately after connecting.
    await client.query("SET client_encoding TO 'UTF8'");
    console.log('Connected to database\n');

    if (arg === 'schema' || arg === 'all') await runFile(client, 'schema.sql');
    if (arg === 'migrations' || arg === 'all') await runMigrationsFolder(client);
    if (arg === 'views' || arg === 'all') await runViewsFolder(client);
    if (arg === 'seed' || arg === 'all') await runFile(client, 'seed.sql');

    if (!arg) {
      console.log('Usage: tsx db-init.ts <schema|migrations|views|seed|all>');
    }

    console.log('\nDone!');
  } catch (err) {
    console.error('Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await client.end();
  }
};

// main() handles its own errors and exits; void states that nothing awaits it
void main();
