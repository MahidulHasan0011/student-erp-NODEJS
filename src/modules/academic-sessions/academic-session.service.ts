import {
  academicSessionRepository,
  type CreateAcademicSessionData,
  type UpdateAcademicSessionData,
} from './academic-session.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { withTransaction } from '../../config/db.js';
import {
  assertString,
  assertDate,
  assertDateOrder,
  assertBoolean,
} from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { AcademicSessionRow } from '../../types/db.types.js';

export type CreateAcademicSessionInput = CreateAcademicSessionData;
export type UpdateAcademicSessionInput = UpdateAcademicSessionData;

export const academicSessionService = {
  async create({
    name,
    start_date,
    end_date,
    admission_test_enabled,
  }: CreateAcademicSessionInput): Promise<AcademicSessionRow> {
    assertString(name, 'name', { max: 50 });
    assertDate(start_date, 'start_date', { required: false });
    assertDate(end_date, 'end_date', { required: false });
    assertDateOrder(start_date, end_date);
    assertBoolean(admission_test_enabled, 'admission_test_enabled', { required: false });

    const existing = await academicSessionRepository.findByName(name);
    if (existing) throw new AppError(`Session "${name}" already exists`, 409);

    return academicSessionRepository.create({
      name,
      start_date,
      end_date,
      admission_test_enabled,
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<AcademicSessionRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      academicSessionRepository.findAll(queryOptions, { limit, offset }),
      academicSessionRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<AcademicSessionRow> {
    const session = await academicSessionRepository.findById(id);
    if (!session) throw new AppError('Academic session not found', 404);
    return session;
  },

  async getActive(): Promise<AcademicSessionRow> {
    const session = await academicSessionRepository.findActive();
    if (!session) throw new AppError('No active academic session found', 404);
    return session;
  },

  async update(id: string, fields: UpdateAcademicSessionInput): Promise<AcademicSessionRow> {
    await this.getById(id);

    if (fields.name !== undefined) {
      fields.name = assertString(fields.name, 'name', { max: 50 });
      const existing = await academicSessionRepository.findByName(fields.name);
      if (existing && existing.id !== id) {
        throw new AppError(`Session "${fields.name}" already exists`, 409);
      }
    }

    assertDate(fields.start_date, 'start_date', { required: false });
    assertDate(fields.end_date, 'end_date', { required: false });
    assertDateOrder(fields.start_date, fields.end_date);

    const updated = await academicSessionRepository.update(id, fields);
    if (!updated) throw new AppError('Academic session not found', 404);
    return updated;
  },

  // ── rule: only one session may be active at a time ────────────
  // deactivate all others before activating the new one — atomic in a transaction
  async activate(id: string): Promise<AcademicSessionRow> {
    await this.getById(id); // 404 check

    return withTransaction(async (client) => {
      await academicSessionRepository.deactivateAll(client);
      const activated = await academicSessionRepository.setActive(client, id);
      if (!activated) throw new AppError('Academic session not found', 404);
      return activated;
    });
  },

  async deactivate(id: string): Promise<AcademicSessionRow> {
    const session = await this.getById(id);
    if (!session.is_active) return session; // already inactive

    // update() only takes name/start_date/end_date, so we run a raw query directly to change is_active
    return withTransaction(async (client) => {
      const { rows } = await client.query<AcademicSessionRow>(
        `UPDATE academic_sessions SET is_active = false, updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        [id],
      );
      return rows[0];
    });
  },

  // ── Admin can turn the admission test on/off ─────────────────
  async toggleAdmissionTest(
    id: string,
    admission_test_enabled: boolean,
  ): Promise<{ id: string; admission_test_enabled: boolean }> {
    if (typeof admission_test_enabled !== 'boolean') {
      throw new AppError('admission_test_enabled (boolean) is required', 400);
    }
    await this.getById(id);
    const updated = await academicSessionRepository.toggleAdmissionTest(id, admission_test_enabled);
    if (!updated) throw new AppError('Academic session not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    const session = await this.getById(id);
    if (session.is_active) {
      throw new AppError('Cannot delete an active session — deactivate it first', 400);
    }
    const deleted = await academicSessionRepository.softDelete(id);
    if (!deleted) throw new AppError('Academic session not found', 404);
    return deleted;
  },
};
