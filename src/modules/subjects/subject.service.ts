import { ALLOWED_UPDATE_FIELDS, subjectRepository } from './subject.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { assertString, assertHasUpdates } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { SubjectRow } from '../../types/db.types.js';

export interface CreateSubjectInput {
  name: string;
  code?: string | null;
}

export interface UpdateSubjectInput {
  name?: string;
  code?: string | null;
}

export const subjectService = {
  async create({ name, code }: CreateSubjectInput): Promise<SubjectRow> {
    name = assertString(name, 'name', { max: 100 });
    code = assertString(code, 'code', { required: false, max: 20 })?.toUpperCase();

    const existingName = await subjectRepository.findByName(name);
    if (existingName) throw new AppError(`Subject "${name}" already exists`, 409);

    if (code) {
      const existingCode = await subjectRepository.findByCode(code);
      if (existingCode) throw new AppError(`Subject code "${code}" already exists`, 409);
    }

    return subjectRepository.create({
      name,
      code,
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<SubjectRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      subjectRepository.findAll(queryOptions, { limit, offset }),
      subjectRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  async getById(id: string): Promise<SubjectRow> {
    const subject = await subjectRepository.findById(id);
    if (!subject) throw new AppError('Subject not found', 404);
    return subject;
  },

  async update(id: string, { name, code }: UpdateSubjectInput): Promise<SubjectRow> {
    await this.getById(id);

    name = assertString(name, 'name', { required: false, max: 100 });
    // code is NULL-able, name is NOT NULL. The uppercase step is a separate statement because
    // `?.toUpperCase()` would turn an explicit null back into undefined and lose the clear.
    code = assertString(code, 'code', { required: false, nullable: true, max: 20 });
    if (code) code = code.toUpperCase();

    if (name) {
      const existing = await subjectRepository.findByName(name);
      if (existing && existing.id !== id)
        throw new AppError(`Subject "${name}" already exists`, 409);
    }
    if (code) {
      const existing = await subjectRepository.findByCode(code);
      if (existing && existing.id !== id)
        throw new AppError(`Subject code "${code}" already exists`, 409);
    }

    const patch = { name, code };
    assertHasUpdates(patch, ALLOWED_UPDATE_FIELDS);

    const updated = await subjectRepository.update(id, patch);
    if (!updated) throw new AppError('Subject not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    await this.getById(id);

    const isAssigned = await subjectRepository.isAssignedToTeacher(id);
    if (isAssigned) {
      throw new AppError('Cannot delete subject — it is assigned to one or more teachers', 400);
    }

    const deleted = await subjectRepository.softDelete(id);
    if (!deleted) throw new AppError('Subject not found', 404);
    return deleted;
  },
};
