import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env.js';
import { entitySchemas } from '../docs/schemas.js';

// ── OpenAPI base definition ─────────────────────────────────────────────
// Define reusable components (security, schema, response) here once,
// then simply document the path in each route file using JSDoc (@openapi) — DRY.
const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Student Management System API',
    version: '1.0.0',
    description:
      'School ERP REST API — JWT auth, permission-based RBAC.\n\n' +
      '**Auth:** First get the `accessToken` with `POST /auth/login`,' +
      'Then, enter it (Bearer) in the **Authorize** button above.' +
      'Each protected endpoint requires a specific permission (e.g., `STUDENT_READ`).',
  },
  servers: [{ url: `http://localhost:${env.PORT}/api/v1`, description: 'Local (v1)' }],
  // All endpoints require bearer auth by default; this is overridden and disabled for auth/login.
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Login, token refresh, logout, current user' },
    { name: 'Users', description: 'System user management' },
    { name: 'Roles', description: 'Role CRUD' },
    { name: 'Permissions', description: 'Permission CRUD' },
    { name: 'Role-Permissions', description: 'Role ↔ permission assignment' },
    { name: 'Students', description: 'Student records' },
    { name: 'Teachers', description: 'Teacher records' },
    { name: 'Classes', description: 'Class CRUD' },
    { name: 'Sections', description: 'Section CRUD' },
    { name: 'Subjects', description: 'Subject CRUD' },
    { name: 'Subject-Assignments', description: 'Teacher ↔ subject ↔ class assignment' },
    { name: 'Academic-Sessions', description: 'Academic session/year' },
    { name: 'Enrollments', description: 'Student enrollment into class/section' },
    { name: 'Exams', description: 'Exam CRUD' },
    { name: 'Exam-Results', description: 'Exam result entry' },
    { name: 'Ranking', description: 'Rank generation & locks' },
    { name: 'Uploads', description: 'Pre-signed file upload (S3/MinIO)' },
    { name: 'Error-Logs', description: 'Server error log (admin only)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token. format: `Bearer <accessToken>`',
      },
    },
    schemas: {
      // entity response schemas (from src/docs/schemas.js) — used by route files via $ref
      ...entitySchemas,
      // ── envelope: Every successful response comes in this shape ──
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Success' },
          data: { type: 'object', nullable: true },
          meta: { type: 'object', nullable: true },
        },
      },
      // ── envelope: Every error response follows this shape ──
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Something went wrong' },
          errors: {
            nullable: true,
            description: 'Field-level details in case of a validation error',
            example: null,
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 137 },
          totalPages: { type: 'integer', example: 7 },
        },
      },
    },
    parameters: {
      IdParam: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Resource UUID',
        schema: { type: 'string', format: 'uuid' },
      },
      PageQuery: {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
      },
      LimitQuery: {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
    responses: {
      Unauthorized: {
        description: '401 — Authorization token required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'Authorization token required' },
          },
        },
      },
      Forbidden: {
        description: '403 — Permission denied for this action.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              success: false,
              message: 'You do not have permission to perform this action',
            },
          },
        },
      },
      NotFound: {
        description: '404 — Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'Resource not found' },
          },
        },
      },
      ValidationError: {
        description: '400 — Input validation failed',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'Validation failed', errors: { field: 'reason' } },
          },
        },
      },
      Conflict: {
        description: '409 — Duplicate / Already exists',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { success: false, message: 'Duplicate entry — record already exists' },
          },
        },
      },
    },
  },
};

// JSDoc (@openapi) blocks in route files are scanned from here
export const swaggerSpec = swaggerJSDoc({
  definition,
  apis: ['./src/modules/**/*.routes.js', './src/docs/*.js'],
});
