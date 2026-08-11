import { examResultService } from './exam-result.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import type { Handler } from '../../types/http.types.js';

type ExamResultController = Record<
  | 'create'
  | 'bulkCreate'
  | 'getAll'
  | 'getById'
  | 'getByExam'
  | 'getMarksheet'
  | 'update'
  | 'delete',
  Handler
>;

export const examResultController: ExamResultController = {
  async create(req, res, next) {
    try {
      const data = await examResultService.create(req.body);
      return successResponse(res, { message: 'Result entered', data, statusCode: 201 });
    } catch (err) {
      next(err);
    }
  },

  // POST /exam-results/bulk  { examId, entries: [{ student_id, subject_id, marks }] }
  async bulkCreate(req, res, next) {
    try {
      const { examId, entries } = req.body;
      if (!examId) return errorResponse(res, { message: 'examId is required', statusCode: 400 });

      const data = await examResultService.bulkCreate(examId, entries);

      // After bulk entry, report whether the exam is now complete, so the frontend
      // can optionally show a "publish now?" prompt right here — the call will be placed here once the auto-trigger module is restored
      const completion = await examResultService.checkAndReportCompletion(examId);

      return successResponse(res, {
        message: 'Bulk results entered',
        data: { results: data, completion },
        statusCode: 201,
      });
    } catch (err) {
      next(err);
    }
  },

  async getAll(req, res, next) {
    try {
      const { data, meta } = await examResultService.getAll(req.query);
      return successResponse(res, { message: 'Exam results fetched', data, meta });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const data = await examResultService.getById(req.params.id);
      return successResponse(res, { message: 'Exam result fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /exam-results/exam/:examId
  async getByExam(req, res, next) {
    try {
      const data = await examResultService.getByExam(req.params.examId);
      return successResponse(res, { message: 'Exam results fetched', data });
    } catch (err) {
      next(err);
    }
  },

  // GET /exam-results/exam/:examId/student/:studentId/marksheet
  async getMarksheet(req, res, next) {
    try {
      const data = await examResultService.getMarksheet(req.params.examId, req.params.studentId);
      return successResponse(res, { message: 'Marksheet fetched', data });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const data = await examResultService.update(req.params.id, req.body);
      return successResponse(res, { message: 'Result updated', data });
    } catch (err) {
      next(err);
    }
  },

  async delete(req, res, next) {
    try {
      await examResultService.delete(req.params.id);
      return successResponse(res, { message: 'Result deleted' });
    } catch (err) {
      next(err);
    }
  },
};
