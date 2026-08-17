import { sectionRepository, type SectionWithClassRow } from './section.repository.js';
import { classRepository } from '../classes/class.repository.js';
import { AppError } from '../../utils/appError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { assertString, assertUuid, assertInteger } from '../../utils/validators.js';
import type { ListQuery, Paginated } from '../../types/common.types.js';
import type { SectionRow } from '../../types/db.types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Input DTOs describe the shape the service EXPECTS, not what it is guaranteed to
// receive — req.body is `any` at the Express boundary. The assert* calls below are
// the real gate; the types exist so everything downstream of them is checked.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateSectionInput {
  class_id: string;
  name: string;
  max_capacity?: number | null;
}

export interface UpdateSectionInput {
  name?: string;
  max_capacity?: number | null;
}

export interface SectionOccupancy {
  enrolled_count: number;
  /** null when max_capacity is unset — the section is treated as unlimited */
  available_seats: number | null;
}

/** What the roll/section distribution engine consumes. */
export interface SectionWithOccupancy extends SectionRow, SectionOccupancy {}

export interface SectionOccupancyDetail extends SectionWithClassRow, SectionOccupancy {
  is_full: boolean;
}

export const sectionService = {
  async create({ class_id, name, max_capacity }: CreateSectionInput): Promise<SectionRow> {
    class_id = assertUuid(class_id, 'class_id');
    name = assertString(name, 'name', { max: 20 }).toUpperCase();
    max_capacity = assertInteger(max_capacity, 'max_capacity', { required: false, min: 1 });

    const cls = await classRepository.findById(class_id);
    if (!cls) throw new AppError('Class not found', 404);

    const existing = await sectionRepository.findByClassAndName(class_id, name);
    if (existing) throw new AppError(`Section "${name}" already exists in this class`, 409);

    return sectionRepository.create({
      class_id,
      name,
      max_capacity,
    });
  },

  async getAll(queryOptions: ListQuery): Promise<Paginated<SectionWithClassRow>> {
    const { page, limit, offset } = getPagination(queryOptions);
    const [data, total] = await Promise.all([
      sectionRepository.findAll(queryOptions, { limit, offset }),
      sectionRepository.countAll(queryOptions),
    ]);
    return { data, meta: buildMeta({ total, page, limit }) };
  },

  // Explicit return types on the methods below: they call each other through `this`,
  // which makes an inferred return type circular.
  async getById(id: string): Promise<SectionWithClassRow> {
    const section = await sectionRepository.findById(id);
    if (!section) throw new AppError('Section not found', 404);
    return section;
  },

  // section's current occupancy (how many students / max_capacity)
  async getOccupancy(id: string): Promise<SectionOccupancyDetail> {
    const section = await this.getById(id);
    const enrolledCount = await sectionRepository.countEnrolledStudents(id);
    return {
      ...section,
      enrolled_count: enrolledCount,
      available_seats:
        section.max_capacity != null ? Math.max(0, section.max_capacity - enrolledCount) : null, // if max_capacity is not set, treated as unlimited
      is_full: section.max_capacity != null && enrolledCount >= section.max_capacity,
    };
  },

  async update(id: string, { name, max_capacity }: UpdateSectionInput): Promise<SectionRow> {
    const section = await this.getById(id);

    assertString(name, 'name', { required: false, max: 20 })?.toUpperCase();
    max_capacity = assertInteger(max_capacity, 'max_capacity', { required: false, min: 1 });

    if (name) {
      const existing = await sectionRepository.findByClassAndName(section.class_id!, name);
      if (existing && existing.id !== id) {
        throw new AppError(`Section "${name}" already exists in this class`, 409);
      }
    }

    if (max_capacity !== undefined) {
      // check when lowering capacity — cannot set it below the number of already enrolled students
      const enrolledCount = await sectionRepository.countEnrolledStudents(id);
      if (max_capacity < enrolledCount) {
        throw new AppError(
          `Cannot set max_capacity to ${max_capacity} — ${enrolledCount} students already enrolled`,
          400,
        );
      }
    }

    const updated = await sectionRepository.update(id, {
      name,
      max_capacity,
    });
    if (!updated) throw new AppError('Section not found', 404);
    return updated;
  },

  async delete(id: string): Promise<{ id: string }> {
    await this.getById(id);

    const hasEnrollments = await sectionRepository.hasEnrollments(id);
    if (hasEnrollments) {
      throw new AppError('Cannot delete section — students are enrolled in it', 400);
    }

    const deleted = await sectionRepository.softDelete(id);
    if (!deleted) throw new AppError('Section not found', 404);
    return deleted;
  },

  // used by the roll/section distribution engine — all sections of a class + occupancy
  async getSectionsForDistribution(class_id: string): Promise<SectionWithOccupancy[]> {
    const sections = await sectionRepository.findByClassId(class_id);
    const withOccupancy = await Promise.all(
      sections.map(async (s) => {
        const enrolledCount = await sectionRepository.countEnrolledStudents(s.id);
        return {
          ...s,
          enrolled_count: enrolledCount,
          available_seats:
            s.max_capacity != null ? Math.max(0, s.max_capacity - enrolledCount) : null,
        };
      }),
    );
    return withOccupancy;
  },
};
