import { rankingService } from './ranking.service.js';
import { successResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type RankingController = Record<
  'generateRoll' | 'recalculate' | 'unlock' | 'getRanking' | 'getHistory' | 'getAuditLog',
  Handler
>;

export const rankingController: RankingController = {
  // POST /ranking/generate-roll  { classId, academicSessionId, sectionId? }
  async generateRoll(req, res, next) {
    try {
      const data = await rankingService.triggerRankingAndRoll({
        ...req.body,
        triggeredBy: req.user.userId,
      });
      return successResponse(res, {
        message: 'Ranking & roll generation started — this runs in the background',
        data,
        statusCode: 202, // Accepted — queued, not finished yet
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /ranking/recalculate  { classId, academicSessionId, sectionId? }
  async recalculate(req, res, next) {
    try {
      const data = await rankingService.recalculate({
        ...req.body,
        triggeredBy: req.user.userId,
      });
      return successResponse(res, {
        message: 'Ranking unlocked and recalculation started in the background',
        data,
        statusCode: 202,
      });
    } catch (err) {
      next(err);
    }
  },

  // POST /ranking/unlock  { classId, academicSessionId }
  async unlock(req, res, next) {
    try {
      const data = await rankingService.unlock({
        ...req.body,
        triggeredBy: req.user.userId,
      });
      return successResponse(res, { message: 'Ranking unlocked', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /ranking/:classId/:academicSessionId — current ranking (cache-first)
  async getRanking(req, res, next) {
    try {
      const { classId, academicSessionId } = req.params;
      const data = await rankingService.getRanking(classId, academicSessionId);
      return successResponse(res, { message: 'Current ranking fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /ranking/:classId/:academicSessionId/history?version=
  async getHistory(req, res, next) {
    try {
      const { classId, academicSessionId } = req.params;
      const data = await rankingService.getHistory(classId, academicSessionId, req.query.version);
      return successResponse(res, { message: 'Ranking history fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /ranking/:classId/:academicSessionId/audit
  async getAuditLog(req, res, next) {
    try {
      const { classId, academicSessionId } = req.params;
      const data = await rankingService.getAuditLog(classId, academicSessionId);
      return successResponse(res, { message: 'Ranking audit log fetched', data });
    } catch (err) {
      next(err);
    }
  },
};
