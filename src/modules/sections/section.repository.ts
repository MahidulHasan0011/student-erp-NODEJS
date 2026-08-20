import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { SectionRow } from '../../types/db.types.js';

/** findAll/findById also select the parent class name. */
export interface SectionWithClassRow extends SectionRow {
  class_name: string;
}

export interface CreateSectionData {
  class_id: string;
  name: string;
  max_capacity?: number | null;
}

/** Both optional — update() only writes the fields that are present. */
export interface UpdateSectionData {
  name?: string;
  max_capacity?: number | null;
}

/**
 * the only columns update() will SET — exported so the service can guard an empty PATCH.
 * update() below checks these one by one rather than looping; keep the two in step.
 */
export const ALLOWED_UPDATE_FIELDS = ['name', 'max_capacity'] as const;

const SORTABLE_FIELDS: Record<string, string> = {
  name: 's.name',
  max_capacity: 's.max_capacity',
  created_at: 's.created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['s.name'],
  filterableColumns: [
    { param: 'class_id', column: 's.class_id' }, // ?class_id=...
  ],
};

export const sectionRepository = {
  async create({ class_id, name, max_capacity }: CreateSectionData): Promise<SectionRow> {
    const { rows } = await query<SectionRow>(
      `INSERT INTO sections (class_id, name, max_capacity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [class_id, name, max_capacity ?? null],
    );
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<SectionWithClassRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 's');
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<SectionWithClassRow>(
      `SELECT s.*, c.name AS class_name
       FROM sections s
       JOIN classes c ON c.id = s.class_id
       ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values,
    );
    return rows;
  },

  async countAll(queryOptions: ListQuery): Promise<number> {
    const values: unknown[] = [];
    const countRef = { value: 1 };
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef, 's');
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM sections s JOIN classes c ON c.id = s.class_id ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<SectionWithClassRow | null> {
    const { rows } = await query<SectionWithClassRow>(
      `SELECT s.*, c.name AS class_name
       FROM sections s
       JOIN classes c ON c.id = s.class_id
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  // whether a section with the same name already exists in the same class — duplicate check
  async findByClassAndName(class_id: string, name: string): Promise<SectionRow | null> {
    const { rows } = await query<SectionRow>(
      `SELECT * FROM sections
       WHERE class_id = $1 AND name = $2 AND deleted_at IS NULL`,
      [class_id, name],
    );
    return rows[0] || null;
  },

  // all sections of a specific class, sorted by name — needed for roll/section distribution
  async findByClassId(class_id: string): Promise<SectionRow[]> {
    const { rows } = await query<SectionRow>(
      `SELECT * FROM sections
       WHERE class_id = $1 AND deleted_at IS NULL
       ORDER BY name ASC`,
      [class_id],
    );
    return rows;
  },

  // how many students are currently enrolled in a section — for capacity checks
  async countEnrolledStudents(sectionId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM student_enrollments
       WHERE section_id = $1 AND deleted_at IS NULL`,
      [sectionId],
    );
    return parseInt(rows[0].count);
  },

  async update(id: string, { name, max_capacity }: UpdateSectionData): Promise<SectionRow | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (name !== undefined) {
      params.push(name);
      //params = ['Section B'] lenght 1
      setClauses.push(`name = $${params.length}`); //name = $1
      //setClauses = [ 'name = $1' ]
    }
    if (max_capacity !== undefined) {
      params.push(max_capacity);
      //params = ['Section B', 50] length 2
      setClauses.push(`max_capacity = $${params.length}`); //max_capacity = $2
      //setClauses = [ 'name = $1', 'max_capacity = $2' ]
    }
    if (!setClauses.length) return null;

    params.push(id);
    //params = ['Section B', 50, 'sec-501'] lenght 3
    const { rows } = await query<SectionRow>(
      `UPDATE sections 
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING *`,
      params,
    );
    // ex,
    // UPDATE sections
    // SET name = $1, max_capacity = $2, updated_at = NOW()
    // WHERE id = $3 AND deleted_at IS NULL
    // RETURNING *
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE sections SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  async hasEnrollments(id: string): Promise<boolean> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM student_enrollments WHERE section_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  },
};
