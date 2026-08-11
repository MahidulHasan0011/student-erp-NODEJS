const GRADE_BANDS = [
  { min: 80, grade: 'A+', point: 5.0 },
  { min: 70, grade: 'A', point: 4.0 },
  { min: 60, grade: 'A-', point: 3.5 },
  { min: 50, grade: 'B', point: 3.0 },
  { min: 40, grade: 'C', point: 2.0 },
  { min: 33, grade: 'D', point: 1.0 },
  { min: 0, grade: 'F', point: 0.0 },
] as const;

/** The letter grades the bands can produce — matches exam_results.grade varchar(5). */
export type Grade = (typeof GRADE_BANDS)[number]['grade'];

/**
 * marks → letter grade, or null when the marks are not a number.
 *
 * The parameter is `unknown` on purpose: exam_results.marks is a Postgres numeric,
 * which node-pg hands back as a STRING, while freshly validated input arrives as a
 * number. Both must work, so it is stringified before parsing — exactly what the
 * previous implicit coercion did.
 */
export const calculateGrade = (marks: unknown): Grade | null => {
  const m = parseFloat(String(marks));
  if (Number.isNaN(m)) return null;
  return GRADE_BANDS.find((b) => m >= b.min)?.grade ?? 'F';
};
