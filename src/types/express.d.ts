// ─────────────────────────────────────────────────────────────────────────────
// Express Request augmentation.
//
// Two middlewares hang extra properties on the request object, and without this
// declaration TypeScript rejects both the write and every read:
//
//   src/middlewares/auth.middleware.js:16   req.user = decoded
//   src/middlewares/rbac.middleware.js:35   req.permissions = userPerms
//
// Both are OPTIONAL on purpose. A route that skips authMiddleware has no req.user,
// and rbacMiddleware only runs where a permission is actually required — so
// handlers are forced to check instead of assuming. src/modules/uploads/upload.service.js
// already guards with `Array.isArray(actor?.permissions)`, which is the pattern
// this typing makes mandatory everywhere else too.
//
// This file is picked up automatically via tsconfig's `include: ["src/**/*"]`;
// nothing needs to import it.
// ─────────────────────────────────────────────────────────────────────────────
import type { AccessTokenPayload } from './auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** set by authMiddleware after a successful jwt.verify */
      user?: AccessTokenPayload;
      /** set by rbacMiddleware — the full permission list of req.user's role */
      permissions?: string[];
    }
  }
}

export {};
