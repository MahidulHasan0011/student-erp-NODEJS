# 🎯 Roll ও Rank Generation — সম্পূর্ণ Workflow (বাংলা)

> এই ডকুমেন্টে **ব়্যাঙ্ক (rank) এবং রোল নম্বর (roll number)** কীভাবে জেনারেট হয় তার
> পুরো data flow এবং step-by-step function calling ব্যাখ্যা করা হয়েছে — একদম শুরু (HTTP request /
> exam publish) থেকে শেষ (database এ roll number বসানো, history save, lock) পর্যন্ত।

---

## ১. মূল ধারণা (Big Picture)

Roll ও Rank generation একটা **asynchronous (background) প্রক্রিয়া**। ইউজার একটা বাটনে ক্লিক করলে
সাথে সাথে result পায় না — বরং একটা **job queue** তে কাজ জমা হয় এবং background worker সেটা করে।

দুইটা কারণে এমন করা হয়েছে:
1. **অনেক student এর হিসাব** — সব একসাথে করলে HTTP request timeout হয়ে যেতে পারে।
2. **Atomicity ও safety** — roll assign, history save, lock — সব একটা DB transaction এ হতে হবে।

পুরো প্রক্রিয়াটা দুইটা queue এর chain:

```
ranking queue  ──(rankedList তৈরি)──►  roll queue  ──(roll assign + history + lock)──►  done
```

### Layer গুলো (কে কার সাথে কথা বলে)

```
routes → controller → service → queue ──► [ranking.job → ranking.engine]
                                              │
                                              ▼ (rankedList)
                                          [roll.job → roll.engine] → DB (transaction)
```

| Layer | ফাইল | দায়িত্ব |
|-------|------|---------|
| Route | `modules/ranking/ranking.routes.js` | HTTP endpoint + permission (RBAC) চেক |
| Controller | `modules/ranking/ranking.controller.js` | req/res handle, service কল |
| Service | `modules/ranking/ranking.service.js` | validation, lock চেক, exam ready চেক, queue তে job পাঠানো |
| Queue | `queues/ranking.queue.js`, `queues/roll.queue.js` | job enqueue (deterministic jobId) |
| Job (worker) | `jobs/ranking.job.js`, `jobs/roll.job.js` | queue থেকে job নিয়ে engine কল করা |
| Engine (core) | `core/ranking.engine.js`, `core/roll.engine.js` | আসল ব্যবসায়িক লজিক (calculation + DB) |
| Repository | `modules/ranking/ranking.repository.js`, `modules/ranking-locks/ranking-lock.repository.js` | raw SQL query |

---

## ২. কখন Generation শুরু হয়? (৩টা entry point)

### (ক) Manual — "Generate Roll" বাটন
```
POST /ranking/generate-roll   { classId, academicSessionId, sectionId? }
```
- প্রথমবার roll তৈরির জন্য।
- আগে থেকে **locked থাকলে ব্লক** হয় (409) → তখন recalculate ব্যবহার করতে হয়।

### (খ) Auto — Exam Publish এর পর (system trigger)
- `FINAL` বা `ADMISSION` exam **PUBLISHED** হলে `exam.service.js` স্বয়ংক্রিয়ভাবে
  `rankingService.autoTriggerAfterPublish()` কল করে।
- এটা **কখনো throw করে না** — publish flow ভাঙতে দেওয়া যাবে না। শর্ত না মিললে চুপচাপ skip
  করে audit log এ লিখে রাখে।

### (গ) Recalculate — Admin (locked অবস্থায় পুনরায়)
```
POST /ranking/recalculate   { classId, academicSessionId, sectionId? }
```
- আগে unlock → তারপর নতুন করে rank+roll জেনারেট → শেষে আবার lock।

---

## ৩. ধাপে ধাপে Function Call (Manual "Generate Roll")

নিচে সবচেয়ে সাধারণ কেসটা — Manual generate — সম্পূর্ণ function call chain সহ:

### STEP 1 — HTTP Request → Route
📁 `ranking.routes.js:168`
```js
router.post('/generate-roll', rbacMiddleware('RANKING_GENERATE'), rankingController.generateRoll);
```
- `authMiddleware` → user লগইন করা কিনা চেক।
- `rbacMiddleware('RANKING_GENERATE')` → user এর এই permission আছে কিনা চেক।

### STEP 2 — Controller
📁 `ranking.controller.js:6` → `generateRoll()`
```js
const data = await rankingService.triggerRankingAndRoll({
  ...req.body,
  triggeredBy: req.user.userId,   // কে trigger করলো — টোকেন থেকে নেওয়া
});
return successResponse(res, { statusCode: 202, ... }); // 202 = Accepted (queued)
```
- সাথে সাথে **202** ফেরত দেয় (কাজ শেষ হয়নি, শুধু queue তে ঢুকেছে)।

### STEP 3 — Service: `triggerRankingAndRoll()`
📁 `ranking.service.js:67`

এখানে যা যা হয় ঠিক এই ক্রমে:
1. **UUID validation** — `assertUuid(classId ...)` দিয়ে সব id বৈধ কিনা।
2. **`loadClassAndSession()`** — class ও academic session সত্যিই আছে কিনা (নাহলে 404)।
3. **Lock চেক** — `rankingLockRepository.isLocked()`
   - locked হলে → **409 Conflict** ("recalculate ব্যবহার করুন")।
4. **Exam ready চেক** — `checkResultsReady()`
   - `FINAL` exam **PUBLISHED** কিনা (নাহলে 400)।
   - session এ `admission_test_enabled` হলে `ADMISSION` exam ও PUBLISHED কিনা।
5. **Queue তে job পাঠায়** — `enqueueRankingJob({...})`
6. ফেরত দেয় `{ jobId, status: 'queued' }`।

### STEP 4 — Queue: `enqueueRankingJob()`
📁 `queues/ranking.queue.js:9`
```js
const jobId = `ranking:${classId}:${academicSessionId}:auto`;  // deterministic!
return addJob(rankingQueue, 'calculate-ranking', data, { jobId });
```
- **Deterministic jobId** কেন? → একই class+session এর জন্য double-click বা duplicate event
  এলেও BullMQ **দ্বিতীয় job টা চুপচাপ ফেলে দেয়** (duplicate guard)।
- recalc flow আলাদা suffix (`:recalc`) পায় যেন normal trigger এর সাথে collision না হয়।

📁 `services/queue.service.js:59` → `addJob()` এ default:
- `attempts: 3` → ব্যর্থ হলে ৩ বার retry।
- `backoff: custom` → **exponential + jitter** (2s, 4s, 8s... এর সাথে random spread) —
  একসাথে অনেক job fail করলে "thundering herd" এড়াতে।

---

## ৪. ব়্যাঙ্ক তৈরি (Ranking Phase) — Background Worker

### STEP 5 — Ranking Worker
📁 `jobs/ranking.job.js:6` → `processor(job)`
```js
const rankedList = await rankingEngine.buildCombinedRanking({
  classId, academicSessionId, admissionTestEnabled, allowWhenLocked,
});
// ranking শেষ → পরের ধাপ roll queue তে পাঠায় (sequential chain)
await enqueueRollJob({ rankedList, classId, academicSessionId, sectionId, lockedBy: triggeredBy });
```

### STEP 6 — Ranking Engine: `buildCombinedRanking()`
📁 `core/ranking.engine.js:120` — **আসল ranking লজিক এখানে**।

প্রথমে আবার lock চেক (safety) — যদি `allowWhenLocked=false` হয়। এরপর **দুইটা scenario**:

#### 🟦 Scenario 1 — `admission_test_enabled = false`
> পুরনো student দের merit + নতুন student দের FIFO

```
oldMeritList = calculateOldStudentMeritList()   // QUIZ+MID+FINAL, view থেকে
nextRank     = oldMeritList.length + 1
fifoList     = calculateFifoRanking(startRank=nextRank)  // নতুন student, admission_date অনুযায়ী
return [...oldMeritList, ...fifoList]
```
- **OLD student:** `student_merit_list` view থেকে (QUIZ+MID+FINAL যোগফল, tie-break সহ rank)।
- **NEW student:** যাদের এখনো `roll_number` NULL — তারা `admission_date`, `created_at` অনুযায়ী
  **FIFO** (আগে ভর্তি আগে rank), merit list এর ঠিক পরের নম্বর থেকে শুরু। এদের score = 0।

#### 🟩 Scenario 2 — `admission_test_enabled = true`
> OLD আর NEW একসাথে merge করে, score দিয়ে একটাই merit list

```
oldMeritList       = calculateOldStudentMeritList()          // OLD score = QUIZ+MID+FINAL
newAdmissionScores = calculateNewStudentAdmissionScores()    // NEW score = ADMISSION marks
combined = [...oldMeritList, ...newAdmissionScores]
return _sortAndRank(combined)   // merge এর পর নতুন করে rank বসাতে হয়
```

#### 🔑 Tie-breaking নিয়ম — `_sortAndRank()` (`ranking.engine.js:62`)
সমান হলে নিচের ক্রমে decide হয়:
1. `total_score` বেশি — উপরে
2. `final_score` বেশি — উপরে
3. `midterm_score` বেশি — উপরে
4. `admission_date` আগে — উপরে
5. `enrollment_created_at` আগে — উপরে
6. সবশেষে `student_id` (deterministic — সবসময় একই ফল)

> ⚠️ Postgres এ `SUM()` string আকারে আসে, তাই তুলনার আগে `Number()` করা হয়।

**আউটপুট:** `rankedList = [{ student_id, rank_position, total_score, ... }]`

---

## ৫. রোল নম্বর বসানো (Roll Phase) — সবচেয়ে গুরুত্বপূর্ণ (Atomic)

### STEP 7 — Roll Worker
📁 `jobs/roll.job.js:7` → `processor(job)`
```js
const { results, version } = await rollEngine.generateRolls({
  rankedList, classId, academicSessionId, sectionId, lockedBy,
});
await cacheService.del(`ranking:current:${classId}:${academicSessionId}`); // stale cache মুছে দেয়
```

### STEP 8 — Roll Engine: `generateRolls()`  — **একটাই DB Transaction**
📁 `core/roll.engine.js:16`

পুরোটা `withTransaction()` এর ভিতরে — **যেকোনো একটা step fail করলে সব rollback** (atomicity)।
ভিতরে ঠিক এই ৫টা ধাপ:

```
┌─ BEGIN TRANSACTION ────────────────────────────────────────┐
│ 1. pg_advisory_xact_lock(hashtext("ranking:class:session")) │  ← concurrency guard
│ 2. roll_number + section assign                             │
│ 3. history snapshot save (version = MAX+1)                  │
│ 4. ranking_locks → lock (is_locked = true)                 │
│ 5. audit_log → GENERATE লেখা                                │
└─ COMMIT (সব একসাথে) ───────────────────────────────────────┘
```

#### ধাপ ১ — Advisory Lock (concurrency safety)
```js
await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`ranking:${classId}:${academicSessionId}`]);
```
- একই class+session এর জন্য **দুইটা job একসাথে চলতে পারবে না** — দ্বিতীয়টা প্রথমটা commit
  হওয়া পর্যন্ত অপেক্ষা করে। Lock transaction শেষে নিজেই release হয় (xact-scoped)।

#### ধাপ ২ — Roll + Section assign
দুইটা পথ:

- **`_assignDirectRoll()`** (`roll.engine.js:81`) — section নেই বা একটা section →
  `roll_number = rank_position` (rank ই roll)।

- **`_assignWithSectionDistribution()`** (`roll.engine.js:98`) — একাধিক section →
  Section A ভরলে B, B ভরলে C... capacity অনুযায়ী sequential। **প্রতিটা section এ roll আবার 1
  থেকে শুরু** হয়। Section data আসে `sectionService.getSectionsForDistribution()` থেকে
  (available_seats = max_capacity − enrolled_count)।

আপডেট হয় `student_enrollments` টেবিলে (`roll_number`, `section_id`)।

#### ধাপ ৩ — History Snapshot — `_saveHistory()` (`roll.engine.js:133`)
```js
version = MAX(version) + 1   // প্রতিবার নতুন version
```
- পুরো ranked list `ranking_history` টেবিলে bulk insert।
- `total_score` আসে rankedList থেকে, `roll_number` আসে আসল assignment থেকে
  (section-wise হলে rank ≠ roll)।
- যে student এর enrollment update হয়নি (যেমন withdrawn), সে snapshot এ যায় না।

#### ধাপ ৪ — Lock
```js
await rankingLockRepository.lock(classId, academicSessionId, lockedBy, client);
```
- নিয়ম: **"rank generate এর পর ranking_locked = true"**।
- `client` পাস করা হয় → এটাও **একই transaction এর অংশ** (roll+history+lock atomic)।
- 📁 `ranking-lock.repository.js:22` — UPSERT (row না থাকলে insert, থাকলে update)।

#### ধাপ ৫ — Audit Trail
```js
await rankingRepository.logAudit({ action: 'GENERATE', ..., toVersion: version }, client);
```
- এটাও একই transaction এ। কে, কখন, কোন version generate করলো — সব লেখা থাকে।

**COMMIT** — এখন সব একসাথে সেভ হলো। ✅

---

## ৬. Auto-trigger Flow (Exam Publish এর পর) — পার্থক্য

📁 `exam.service.js:137` → publish() এর শেষে:
```js
if (exam.exam_type === 'FINAL' || exam.exam_type === 'ADMISSION') {
  await rankingService.autoTriggerAfterPublish({ classId, academicSessionId, examType });
}
```

📁 `ranking.service.js:99` → `autoTriggerAfterPublish()` — Manual থেকে যেসব আলাদা:
- **কখনো throw করে না** — পুরোটা try/catch এ মোড়ানো।
- locked হলে → skip + audit `AUTO_TRIGGER_SKIP` (reason: locked)।
- exam ready না হলে → skip + audit `AUTO_TRIGGER_SKIP` (reason: results_not_ready)।
  (এখানে `throwOnMissing=false` — throw না করে শুধু `false` ফেরত)।
- সব ঠিক থাকলে → `enqueueRankingJob({ triggeredBy: null })` (system trigger) + audit `AUTO_TRIGGER`।
- এরপরের flow **হুবহু একই** (STEP 4 থেকে STEP 8)।

---

## ৭. Recalculate Flow (Admin) — locked অবস্থায় পুনরায়

📁 `ranking.service.js:155` → `recalculate()`

```
1. exam ready চেক (নাহলে 400)
2. rankingLockRepository.unlock()          ← আগে explicit unlock
   + audit: UNLOCK (context: recalculate)
3. enqueueRankingJob({ allowWhenLocked: true })   ← lock চেক bypass
4. cache মুছে দেয় (stale)
```
- `allowWhenLocked: true` → `buildCombinedRanking()` এ lock চেক skip হয় (`ranking.engine.js:126`)।
- জব শেষ হলে roll.engine ধাপ ৪ এ **আবার lock** করে দেয় → শেষে আবার locked অবস্থায় ফিরে আসে।
- আলাদা jobId suffix (`:recalc`) → normal job এর সাথে collision নেই।

---

## ৮. পড়ার (Read) Endpoint গুলো

| Endpoint | Function | কী করে |
|----------|----------|--------|
| `GET /ranking/:classId/:sessionId` | `getRanking()` | **cache-first** current ranking (`ranking.service.js:216`)। cache miss হলে সর্বশেষ version এর snapshot পড়ে (TTL ১ ঘণ্টা)। |
| `GET .../history?version=` | `getHistory()` | সব version list + নির্দিষ্ট version এর snapshot। |
| `GET .../audit` | `getAuditLog()` | GENERATE / UNLOCK / AUTO_TRIGGER ইত্যাদি log। |

> **কেন live `student_enrollments.roll_number` না পড়ে `ranking_history` পড়ে?**
> কারণ history এ `rank_position` + `total_score` + `roll_number` একসাথে থাকে — এটাই
> authoritative snapshot। (`ranking.repository.js:10` এর কমেন্ট দেখুন।)

---

## ৯. Database টেবিল গুলো

| টেবিল | কাজ |
|-------|-----|
| `student_enrollments` | live `roll_number`, `section_id` — এখানে assign হয় |
| `ranking_history` | প্রতিটা generation এর immutable snapshot (version সহ) |
| `ranking_locks` | class+session lock state (is_locked, locked_by, locked_at) |
| `ranking_audit_log` | কে কখন কী action নিলো |
| `student_merit_list` (view) | OLD student দের QUIZ+MID+FINAL merit + tie-break rank |

---

## ১০. সম্পূর্ণ Flow — এক নজরে (Sequence)

```
[Admin ক্লিক] বা [Exam Publish]
        │
        ▼
ranking.routes → ranking.controller → ranking.service
        │  (validation + lock চেক + exam ready চেক)
        ▼
enqueueRankingJob() ──► [ranking queue]
        │
        ▼   (background worker)
ranking.job → ranking.engine.buildCombinedRanking()
        │     Scenario 1: OLD merit + NEW FIFO
        │     Scenario 2: (OLD + NEW) merge → _sortAndRank()
        ▼   rankedList
enqueueRollJob() ──► [roll queue]
        │
        ▼   (background worker)
roll.job → roll.engine.generateRolls()
        │
        ▼  ┌── ONE TRANSACTION ──────────────┐
           │ 1. advisory lock                │
           │ 2. roll + section assign        │
           │ 3. history snapshot (version++) │
           │ 4. ranking lock = true          │
           │ 5. audit: GENERATE              │
           └── COMMIT ───────────────────────┘
        │
        ▼
cache invalidate → ✅ Done
```

---

## ১১. গুরুত্বপূর্ণ Business Rule সংক্ষেপে

1. `FINAL` exam PUBLISHED না হলে ranking চলবে না (admission enabled হলে `ADMISSION`ও লাগবে)।
2. Generate হয়ে গেলে **auto-lock**; locked অবস্থায় auto-recalc হয় না।
3. Locked অবস্থায় নতুন করতে হলে → `recalculate` (unlock → regenerate → re-lock)।
4. একই class+session এ **দুইটা job একসাথে চলতে পারে না** (jobId + advisory lock)।
5. roll, history, lock — **সব একসাথে সফল না হলে কিছুই সেভ হয় না** (atomic transaction)।
6. প্রতিবার generate = নতুন `version` — পুরনো snapshot হারায় না (audit + history)।
```
