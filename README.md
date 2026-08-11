# Student Management System

Express + PostgreSQL API for managing students, teachers, classes, exams, results, ranking (with auto roll/rank generation), attendance, and RBAC.

## Stack

- Node.js >= 18 (ESM, `"type": "module"`)
- TypeScript 6 in `strict` mode — `tsx` for dev, `tsc` build to `dist/`
- Express 5
- PostgreSQL via `pg` (raw SQL in repositories, `withTransaction()` helper)
- Redis 4 (token store + permission cache)
- BullMQ (queues + workers for ranking/roll generation)
- JWT (15 min access + 7 day refresh with rotation), bcryptjs for passwords

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+

## Setup

```bash
npm install --legacy-peer-deps
```

The flag is required: `bullmq` declares an optional peer of `redis >= 5`, this project
pins `redis@4`, and npm refuses the tree without it. Dropping the flag needs a
`redis@5` upgrade first (breaking client API changes).

Create a `.env` file in the repo root with at least:

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://user:password@localhost:5432/student_management

JWT_ACCESS_SECRET=change_me
JWT_REFRESH_SECRET=change_me_too
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

BCRYPT_ROUNDS=12
```

## Database setup (run in order)

```bash
npm run db:schema     # create tables + enums
npm run db:migrate    # ranking lock/history tables + exam status enum
npm run db:views      # 4 reporting views (merit list, student profile, ...)
npm run db:seed       # default roles, permissions, super-admin
```

Shortcut for the full bootstrap:

```bash
npm run db:init
```

Reset to a clean state:

```bash
npm run db:fresh      # truncate everything, then re-seed
```

Default super-admin (change the password after first login):

```
email:    admin@school.com
password: Admin@1234
```

## Run

```bash
npm run dev           # tsx watch (TypeScript, no build step)
npm run build         # tsc -> dist/
npm start             # production (runs dist/server.js)
```

- Health: `GET http://localhost:4000/health`
- API base: `http://localhost:4000/api/v1`

## Quality

```bash
npm run check         # typecheck + lint + format:check
npm run ci            # check + unit tests + build  (what CI runs)

npm run lint
npm run format:check
```

## Project layout

```
src/
  server.ts, app.ts          entry + Express config
  api/v1/index.ts            route mounting
  config/                    env, db pool + withTransaction, redis client, swagger
  types/                     db row types, auth/http types, express.d.ts augmentation
  modules/<name>/            repository → service → controller → routes → validation
  core/                      pure business engines (ranking, roll, attendance, permission)
  services/                  cache + queue (BullMQ) wrappers
  queues/, jobs/             BullMQ queue defs + worker processors
  middlewares/               auth (JWT + requireUser), rbac (permission-name based), error
  utils/                     appError, response, pagination, queryBuilder, order, validators
  docs/                      swagger components + written guides
database/
  schema.sql, seed.sql       canonical DDL + default data
  migrations/                additive ALTERs (run by db:migrate)
  views/                     4 reporting views (run by db:views)
  db-init.ts, db-truncate.ts script entrypoints
tests/
  unit/                      no services needed (run by npm run ci)
  integration/               need Postgres + Redis; opt in with TEST_INTEGRATION=1
```

Imports carry `.js` extensions even in `.ts` files — that is what NodeNext ESM
resolution requires, and it is why the migration changed no import paths.

See `.speclet/plans/requirements.md` for the full feature spec and business rules.
