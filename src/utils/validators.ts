import { AppError } from './appError.js';

// ─────────────────────────────────────────────────────────────────────────
// shared input validators — no library; on any failure they throw AppError(msg, 400).
// Each assert* returns a normalized value (e.g. trimmed string / number),
// so the caller can use it directly:  const name = assertString(name, 'name', { max: 50 });
//
// required (default true): throws if value is null/undefined.
//   when not required (required:false) and value is null/undefined → returns undefined (skip).
//
// nullable (default false): an explicit null survives as null instead of collapsing to
//   undefined. That is what lets a PATCH clear a column — every repository update() skips
//   undefined fields, so without this a body of {"phone": null} silently changes nothing.
//   Enable it only for columns the schema declares NULL-able; the Update*Data DTOs already
//   mark exactly those with `| null`. Setting a NOT NULL column to null would be rejected
//   by Postgres and surface as a 500 rather than a 400.
//   Note "" is NOT a clear signal — an empty string still follows the required/undefined
//   path, because a blank text input is far more often an accident than an intent to erase.
//
// ── Why every function is overloaded ──
// The return type depends on the `required` and `nullable` flags: with required on and
// nullable off, the function either returns a value or throws, so the result is never
// undefined. Writing one signature returning `string | null | undefined` would force a
// pointless null check at ~200 call sites. The three overloads encode that:
//   assertString(v, 'name')                                     → string
//   assertString(v, 'name', { required: false })                 → string | undefined
//   assertString(v, 'name', { required: false, nullable: true }) → string | null | undefined
// Passing a whole options object whose `required` is a dynamic boolean falls to the
// last overload, which is the safe answer.
// ─────────────────────────────────────────────────────────────────────────

// enum/CHECK values from the schema — re-exported from the single source of truth in
// types/db.types.ts, so the runtime list and the row types can never disagree.
export {
  GENDERS,
  EXAM_TYPES,
  EXAM_STATUSES,
  ENROLLMENT_TYPES,
  ATTENDANCE_STATUSES,
} from '../types/db.types.js';
export type {
  Gender,
  ExamType,
  ExamStatus,
  EnrollmentType,
  AttendanceStatus,
} from '../types/db.types.js';

export interface RequiredOption {
  required?: boolean;
  /** let an explicit null through as null, so a PATCH can clear the column — see header */
  nullable?: boolean;
}
export interface StringOptions extends RequiredOption {
  min?: number;
  max?: number;
  trim?: boolean;
}
export interface RangeOptions extends RequiredOption {
  min?: number;
  max?: number;
}
export interface ArrayOptions extends RequiredOption {
  min?: number;
  max?: number;
}

const isMissing = (v: unknown): boolean => v === undefined || v === null;

// common logic for handling a missing value — throw if required, otherwise undefined.
// An explicit null is different from an absent value: with nullable:true it survives so the
// SET clause can write NULL. `required` still governs undefined, so { required: true,
// nullable: true } means "the key must be present, but null is an accepted value".
const handleMissing = (
  value: unknown,
  field: string,
  required: boolean,
  nullable: boolean,
): null | undefined => {
  if (value === null && nullable) return null;
  if (required) throw new AppError(`${field} is required`, 400);
  return undefined;
};

/**
 * string — type + (after trim) non-empty + length range.
 * @returns the trimmed string, or undefined if optional+absent
 */
export function assertString(
  value: unknown,
  field: string,
  options?: StringOptions & { required?: true; nullable?: false },
): string;
export function assertString(
  value: unknown,
  field: string,
  options: StringOptions & { nullable: true },
): string | null | undefined;
export function assertString(
  value: unknown,
  field: string,
  options: StringOptions,
): string | undefined;
export function assertString(
  value: unknown,
  field: string,
  { required = true, min = 1, max, trim = true, nullable = false }: StringOptions = {},
): string | null | undefined {
  if (isMissing(value)) return handleMissing(value, field, required, nullable);
  if (typeof value !== 'string') {
    throw new AppError(`${field} must be a string`, 400);
  }
  const out = trim ? value.trim() : value;
  if (out === '') {
    // provided but blank — if optional, treat it as "not provided"
    if (!required) return undefined;
    throw new AppError(`${field} is required`, 400);
  }
  if (out.length < min) throw new AppError(`${field} must be at least ${min} characters`, 400);
  if (max && out.length > max) throw new AppError(`${field} too long (max ${max} characters)`, 400);
  return out;
}

/** uuid — loose like the Postgres `uuid` type (does not check the version/variant nibble). */
export function assertUuid(
  value: unknown,
  field: string,
  options?: RequiredOption & { required?: true; nullable?: false },
): string;
export function assertUuid(
  value: unknown,
  field: string,
  options: RequiredOption & { nullable: true },
): string | null | undefined;
export function assertUuid(
  value: unknown,
  field: string,
  options: RequiredOption,
): string | undefined;
export function assertUuid(
  value: unknown,
  field: string,
  { required = true, nullable = false }: RequiredOption = {},
): string | null | undefined {
  if (isMissing(value)) return handleMissing(value, field, required, nullable);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new AppError(`${field} must be a valid id`, 400);
  }
  return value;
}

/** integer — also accepts a "12" string (coerce), then min/max. @returns number */
export function assertInteger(
  value: unknown,
  field: string,
  options?: RangeOptions & { required?: true; nullable?: false },
): number;
export function assertInteger(
  value: unknown,
  field: string,
  options: RangeOptions & { nullable: true },
): number | null | undefined;
export function assertInteger(
  value: unknown,
  field: string,
  options: RangeOptions,
): number | undefined;
export function assertInteger(
  value: unknown,
  field: string,
  { required = true, min, max, nullable = false }: RangeOptions = {},
): number | null | undefined {
  if (isMissing(value) || value === '') return handleMissing(value, field, required, nullable);
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) throw new AppError(`${field} must be an integer`, 400);
  if (min !== undefined && n < min) throw new AppError(`${field} must be >= ${min}`, 400);
  if (max !== undefined && n > max) throw new AppError(`${field} must be <= ${max}`, 400);
  return n;
}

/** decimal/number — for marks etc. @returns number */
export function assertNumber(
  value: unknown,
  field: string,
  options?: RangeOptions & { required?: true; nullable?: false },
): number;
export function assertNumber(
  value: unknown,
  field: string,
  options: RangeOptions & { nullable: true },
): number | null | undefined;
export function assertNumber(
  value: unknown,
  field: string,
  options: RangeOptions,
): number | undefined;
export function assertNumber(
  value: unknown,
  field: string,
  { required = true, min, max, nullable = false }: RangeOptions = {},
): number | null | undefined {
  if (isMissing(value) || value === '') return handleMissing(value, field, required, nullable);
  const n = typeof value === 'number' ? value : Number(value);
  if (typeof n !== 'number' || Number.isNaN(n))
    throw new AppError(`${field} must be a number`, 400);
  if (min !== undefined && n < min) throw new AppError(`${field} must be >= ${min}`, 400);
  if (max !== undefined && n > max) throw new AppError(`${field} must be <= ${max}`, 400);
  return n;
}

/** boolean — strict type check (string "true" is not accepted). @returns boolean */
export function assertBoolean(
  value: unknown,
  field: string,
  options?: RequiredOption & { required?: true; nullable?: false },
): boolean;
export function assertBoolean(
  value: unknown,
  field: string,
  options: RequiredOption & { nullable: true },
): boolean | null | undefined;
export function assertBoolean(
  value: unknown,
  field: string,
  options: RequiredOption,
): boolean | undefined;
export function assertBoolean(
  value: unknown,
  field: string,
  { required = true, nullable = false }: RequiredOption = {},
): boolean | null | undefined {
  if (isMissing(value)) return handleMissing(value, field, required, nullable);
  if (typeof value !== 'boolean') throw new AppError(`${field} must be a boolean`, 400);
  return value;
}

/**
 * date — must be a string and parseable by Date.parse.
 * Date.parse wrongly accepts a number, so typeof string is mandatory.
 * @returns the original string
 */
export function assertDate(
  value: unknown,
  field: string,
  options?: RequiredOption & { required?: true; nullable?: false },
): string;
export function assertDate(
  value: unknown,
  field: string,
  options: RequiredOption & { nullable: true },
): string | null | undefined;
export function assertDate(
  value: unknown,
  field: string,
  options: RequiredOption,
): string | undefined;
export function assertDate(
  value: unknown,
  field: string,
  { required = true, nullable = false }: RequiredOption = {},
): string | null | undefined {
  if (isMissing(value) || value === '') return handleMissing(value, field, required, nullable);
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AppError(`${field} is invalid (use YYYY-MM-DD)`, 400);
  }
  return value;
}

/** start < end — only checked when both are given. */
export function assertDateOrder(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
  {
    startField = 'start_date',
    endField = 'end_date',
  }: { startField?: string; endField?: string } = {},
): void {
  if (start && end && new Date(start) >= new Date(end)) {
    throw new AppError(`${startField} must be before ${endField}`, 400);
  }
}

/**
 * enum — must be within the allowed list. @returns value
 *
 * Generic over the allow-list, so passing a readonly const array narrows the result
 * to that union: assertEnum(g, 'gender', GENDERS) is typed Gender, not string.
 */
export function assertEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  options?: RequiredOption & { required?: true; nullable?: false },
): T;
export function assertEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  options: RequiredOption & { nullable: true },
): T | null | undefined;
export function assertEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  options: RequiredOption,
): T | undefined;
export function assertEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  { required = true, nullable = false }: RequiredOption = {},
): T | null | undefined {
  if (isMissing(value) || value === '') return handleMissing(value, field, required, nullable);
  if (!allowed.includes(value as T)) {
    throw new AppError(`${field} must be one of: ${allowed.join(', ')}`, 400);
  }
  return value as T;
}

/**
 * array — for bulk/assign. @returns array
 *
 * Elements are NOT inspected, so the default element type is `unknown`. A caller that
 * knows the shape can opt in explicitly — assertArray<{ student_id: string }>(rows, 'rows') —
 * which is an unchecked assertion, exactly as it was before typing.
 */
export function assertArray<T = unknown>(
  value: unknown,
  field: string,
  options?: ArrayOptions & { required?: true; nullable?: false },
): T[];
export function assertArray<T = unknown>(
  value: unknown,
  field: string,
  options: ArrayOptions & { nullable: true },
): T[] | null | undefined;
export function assertArray<T = unknown>(
  value: unknown,
  field: string,
  options: ArrayOptions,
): T[] | undefined;
export function assertArray<T = unknown>(
  value: unknown,
  field: string,
  { required = true, min = 1, max, nullable = false }: ArrayOptions = {},
): T[] | null | undefined {
  if (isMissing(value)) return handleMissing(value, field, required, nullable);
  if (!Array.isArray(value)) throw new AppError(`${field} must be an array`, 400);
  if (value.length < min) throw new AppError(`${field} must have at least ${min} item(s)`, 400);
  if (max && value.length > max) throw new AppError(`${field} must have at most ${max} items`, 400);
  return value as T[];
}

/**
 * PATCH guard — at least one of the columns update() can actually SET must be present.
 *
 * Every repository update() returns null for two unrelated reasons: there was nothing to
 * SET, and there is no such row. The services all report the second one ("X not found",
 * 404), so without this check an empty body — or one carrying only keys that aren't in
 * the allow-list — answers a misleading 404 instead of a 400.
 *
 * Call it immediately before the repository, i.e. AFTER the field validation — validation is
 * what settles whether a null counts. On a nullable field {"phone": null} is a real update
 * (it clears the column); on a non-nullable one it collapses to undefined and is not.
 *
 * `allowed` is the repository's ALLOWED_UPDATE_FIELDS — the same list update() loops over,
 * so the guard and the SET clause can never disagree about which columns count.
 */
export function assertHasUpdates<T extends object>(
  fields: T,
  allowed: readonly (keyof T & string)[],
): void {
  if (allowed.some((key) => fields[key] !== undefined)) return;
  throw new AppError(`No fields to update — provide at least one of: ${allowed.join(', ')}`, 400);
}
