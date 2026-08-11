import { query } from '../../config/db.js';
import { buildWhereClause, type FilterConfig } from '../../utils/queryBuilder.js';
import { buildOrder } from '../../utils/order.js';
import type { ListQuery, Pagination } from '../../types/common.types.js';
import type { ClassRow } from '../../types/db.types.js';

/** One element of the json_agg'd sections array. */
export interface ClassSectionSummary {
  id: string;
  name: string;
  max_capacity: number | null;
}

/** findByIdWithSections — the class plus its sections, aggregated into json by Postgres. */
export interface ClassWithSectionsRow extends ClassRow {
  sections: ClassSectionSummary[];
}

export interface ClassNameData {
  name: string;
}

const SORTABLE_FIELDS: Record<string, string> = {
  name: 'name',
  created_at: 'created_at',
};

const FILTER_CONFIG: FilterConfig = {
  searchableColumns: ['name'],
  filterableColumns: [],
};

export const classRepository = {
  async create({ name }: ClassNameData): Promise<ClassRow> {
    const { rows } = await query<ClassRow>(`INSERT INTO classes (name) VALUES ($1) RETURNING *`, [
      name,
    ]);
    return rows[0];
  },

  async findAll(
    queryOptions: ListQuery,
    { limit, offset }: Pick<Pagination, 'limit' | 'offset'>,
  ): Promise<ClassRow[]> {
    const values: unknown[] = [];
    const countRef = { value: 1 };

    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { sortBy, sortOrder } = buildOrder(queryOptions, SORTABLE_FIELDS, 'created_at');

    values.push(limit, offset);
    const limitIdx = countRef.value;
    const offsetIdx = countRef.value + 1;

    const { rows } = await query<ClassRow>(
      `SELECT * FROM classes
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
    const where = buildWhereClause(queryOptions, values, FILTER_CONFIG, countRef);
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*) FROM classes ${where}`,
      values,
    );
    return parseInt(rows[0].count);
  },

  async findById(id: string): Promise<ClassRow | null> {
    const { rows } = await query<ClassRow>(
      `SELECT * FROM classes WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] || null;
  },

  // class together with all of its sections (if any) — a very common use case
  async findByIdWithSections(id: string): Promise<ClassWithSectionsRow | null> {
    const { rows } = await query<ClassWithSectionsRow>(
      `SELECT
         c.*,
         COALESCE(json_agg(
           json_build_object('id', s.id, 'name', s.name, 'max_capacity', s.max_capacity)
           ORDER BY s.name
         ) FILTER (WHERE s.id IS NOT NULL), '[]') AS sections
       FROM classes c
       LEFT JOIN sections s ON s.class_id = c.id AND s.deleted_at IS NULL
       WHERE c.id = $1 AND c.deleted_at IS NULL
       GROUP BY c.id`,
      [id],
    );
    return rows[0] || null;
  },

  async findByName(name: string): Promise<ClassRow | null> {
    const { rows } = await query<ClassRow>(
      `SELECT * FROM classes WHERE name = $1 AND deleted_at IS NULL`,
      [name],
    );
    return rows[0] || null;
  },

  async update(id: string, { name }: ClassNameData): Promise<ClassRow | null> {
    const { rows } = await query<ClassRow>(
      `UPDATE classes SET name = $1, updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [name, id],
    );
    return rows[0] || null;
  },

  async softDelete(id: string): Promise<{ id: string } | null> {
    const { rows } = await query<{ id: string }>(
      `UPDATE classes SET deleted_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id],
    );
    return rows[0] || null;
  },

  // check before delete — whether any section/enrollment exists
  async hasSections(id: string): Promise<boolean> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM sections WHERE class_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    );
    return rows.length > 0;
  },
};
