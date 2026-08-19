error-log মডিউলটি (src/modules/error-logs/) মূলত অ্যাপের error handling flow-এর সাথে যুক্ত। কোথায় কোথায় ব্যবহার হচ্ছে দেখে নাও:

১. Core মডিউল ফাইলগুলো (src/modules/error-logs/)

error-log.service.ts — মূল লজিক: log(), getAll(), getById(), delete(), clear()
error-log.repository.ts — DB query গুলো (create, findAll, findById, softDelete, clear)
error-log.controller.ts — HTTP handler গুলো
error-log.routes.ts — /error-logs এর route গুলো (RBAC দিয়ে ERROR_LOG_READ / ERROR_LOG_DELETE permission চেক করে)
২. যেখান থেকে কল হচ্ছে (actual usage)

error.middleware.ts:58 — এখানেই আসল ব্যবহার: গ্লোবাল error handling middleware-এ যেকোনো error আসলে errorLogService.log(err, req) কল করে DB-তে log সেভ করে।
api/v1/index.ts:19,42 — এখানে /error-logs route রেজিস্টার করা হয়েছে, যাতে API দিয়ে error log গুলো দেখা/ডিলিট করা যায়।
৩. অন্যান্য রেফারেন্স

db.types.ts:358 — ErrorLogRow টাইপ ডেফিনিশন
docs/schemas.ts:293 — Swagger/OpenAPI schema
appError.ts:7 — কমেন্টে উল্লেখ আছে যে এই ফাইলের error code পরিবর্তন করলে error-log.service-এর সেভ করা পুরনো log data-র সাথে মিসম্যাচ হতে পারে