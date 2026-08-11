import { Router } from 'express';
import { rankingController } from './ranking.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rbacMiddleware } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authMiddleware);

// ── Read ──
/**
 * @openapi
 * /ranking/{classId}/{academicSessionId}:
 *   get:
 *     tags: [Ranking]
 *     summary: Current ranking for a class and session
 *     description: >-
 *       Requires `RANKING_READ` permission. cache-first — checks the cache first, and if not found returns the current ranking snapshot.
 *       Returns 404 if the class or academic session is not found.
 *     parameters:
 *       - { name: classId, in: path, required: true, description: 'Class UUID', schema: { type: string, format: uuid } }
 *       - { name: academicSessionId, in: path, required: true, description: 'Academic session UUID', schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: current ranking list
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { $ref: '#/components/schemas/RankingEntry' } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:classId/:academicSessionId',
  rbacMiddleware('RANKING_READ'),
  rankingController.getRanking,
);

/**
 * @openapi
 * /ranking/{classId}/{academicSessionId}/history:
 *   get:
 *     tags: [Ranking]
 *     summary: Ranking history (snapshot and version list)
 *     description: >-
 *       Requires `RANKING_READ` permission. Returns all available versions and (optionally) the snapshots for a specific version.
 *       Without a `version` query, the latest/all snapshots are returned.
 *     parameters:
 *       - { name: classId, in: path, required: true, description: 'Class UUID', schema: { type: string, format: uuid } }
 *       - { name: academicSessionId, in: path, required: true, description: 'Academic session UUID', schema: { type: string, format: uuid } }
 *       - { name: version, in: query, required: false, description: 'filter by a specific version', schema: { type: integer } }
 *     responses:
 *       200:
 *         description: history
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         versions: { type: array, items: { type: object } }
 *                         snapshots: { type: array, items: { $ref: '#/components/schemas/RankingEntry' } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:classId/:academicSessionId/history',
  rbacMiddleware('RANKING_READ'),
  rankingController.getHistory,
);

/**
 * @openapi
 * /ranking/{classId}/{academicSessionId}/audit:
 *   get:
 *     tags: [Ranking]
 *     summary: Ranking audit log
 *     description: >-
 *       Requires `RANKING_READ` permission. Returns the ranking-related audit log for this class and session
 *       (generate, unlock, auto-trigger and similar actions).
 *     parameters:
 *       - { name: classId, in: path, required: true, description: 'Class UUID', schema: { type: string, format: uuid } }
 *       - { name: academicSessionId, in: path, required: true, description: 'Academic session UUID', schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: audit log
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: array, items: { type: object } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get(
  '/:classId/:academicSessionId/audit',
  rbacMiddleware('RANKING_READ'),
  rankingController.getAuditLog,
);

// ── Generate (manual, first time) ──
/**
 * @openapi
 * /ranking/generate-roll:
 *   post:
 *     tags: [Ranking]
 *     summary: Start rank and roll generation (manual, first time)
 *     description: >-
 *       Requires `RANKING_GENERATE` permission. Enqueues ranking and roll generation as a background job (202 Accepted).
 *       Returns 409 if already locked (use recalculate in that case).
 *       Returns 400 if the FINAL exam (and the ADMISSION exam too, if admission test is enabled for the session) is not PUBLISHED.
 *       triggeredBy is taken automatically from the logged-in user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, academicSessionId]
 *             properties:
 *               classId: { type: string, format: uuid }
 *               academicSessionId: { type: string, format: uuid }
 *               sectionId: { type: string, format: uuid, description: 'optional — for a specific section' }
 *     responses:
 *       202:
 *         description: job has been queued
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/RankingJob' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 */
router.post('/generate-roll', rbacMiddleware('RANKING_GENERATE'), rankingController.generateRoll);

// ── Admin-only: unlock + recalculate ──
/**
 * @openapi
 * /ranking/recalculate:
 *   post:
 *     tags: [Ranking]
 *     summary: Unlock ranking and start recalculation (admin)
 *     description: >-
 *       Requires `RANKING_RECALCULATE` permission. First releases the lock, then enqueues
 *       recalculation + regenerate as a background job (202 Accepted) and clears the stale cache.
 *       Returns 400 if the FINAL (and ADMISSION, when admission test is enabled) exam is not PUBLISHED.
 *       triggeredBy is taken automatically from the logged-in user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, academicSessionId]
 *             properties:
 *               classId: { type: string, format: uuid }
 *               academicSessionId: { type: string, format: uuid }
 *               sectionId: { type: string, format: uuid, description: 'optional' }
 *     responses:
 *       202:
 *         description: recalculation has started
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/RankingJob' }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/recalculate', rbacMiddleware('RANKING_RECALCULATE'), rankingController.recalculate);

/**
 * @openapi
 * /ranking/unlock:
 *   post:
 *     tags: [Ranking]
 *     summary: Release the ranking lock (without regenerating, admin)
 *     description: >-
 *       Requires `RANKING_UNLOCK` permission. Only releases the lock (without any recalculation/regenerate) —
 *       for when an admin wants to edit manually. Returns 404 if the class or session is not found.
 *       triggeredBy is taken automatically from the logged-in user.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, academicSessionId]
 *             properties:
 *               classId: { type: string, format: uuid }
 *               academicSessionId: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: unlock successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data: { type: object }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.post('/unlock', rbacMiddleware('RANKING_UNLOCK'), rankingController.unlock);

export default router;
