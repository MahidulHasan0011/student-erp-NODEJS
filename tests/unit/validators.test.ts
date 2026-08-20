import { describe, it, expect } from 'vitest';
import {
  assertString,
  assertUuid,
  assertInteger,
  assertNumber,
  assertBoolean,
  assertDate,
  assertDateOrder,
  assertEnum,
  assertArray,
  assertHasUpdates,
  GENDERS,
} from '../../src/utils/validators.js';
import { AppError } from '../../src/utils/appError.js';

// No external dependencies — pure functions, always runnable.
describe('validators', () => {
  describe('assertString', () => {
    it('trims and returns a valid string', () => {
      expect(assertString('  hi ', 'name')).toBe('hi');
    });
    it('throws when required and empty', () => {
      expect(() => assertString('', 'name')).toThrowError(/required/);
      expect(() => assertString(undefined, 'name')).toThrowError(/required/);
    });
    it('returns undefined when optional and absent', () => {
      expect(assertString(undefined, 'name', { required: false })).toBeUndefined();
    });
    it('throws on non-string', () => {
      expect(() => assertString(123, 'name')).toThrowError(/must be a string/);
    });
    it('applies min/max length', () => {
      expect(() => assertString('ab', 'name', { min: 3 })).toThrowError(/at least 3/);
      expect(() => assertString('abcd', 'name', { max: 3 })).toThrowError(/too long/);
    });
    it('sets statusCode 400', () => {
      try {
        assertString(undefined, 'name');
      } catch (e) {
        // `e` is unknown under useUnknownInCatchVariables — assert what it actually is
        // rather than casting blindly
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).statusCode).toBe(400);
      }
    });
  });

  describe('assertUuid', () => {
    it('accepts a valid uuid', () => {
      const id = '10000000-0000-0000-0000-000000000001';
      expect(assertUuid(id, 'id')).toBe(id);
    });
    it('throws on invalid uuid', () => {
      expect(() => assertUuid('not-a-uuid', 'id')).toThrowError(/valid id/);
    });
  });

  describe('assertInteger', () => {
    it('coerces the string "12"', () => {
      expect(assertInteger('12', 'age')).toBe(12);
    });
    it('throws on non-integer', () => {
      expect(() => assertInteger('12.5', 'age')).toThrowError(/integer/);
    });
    it('applies min/max', () => {
      expect(() => assertInteger(0, 'age', { min: 1 })).toThrowError(/>= 1/);
      expect(() => assertInteger(10, 'age', { max: 5 })).toThrowError(/<= 5/);
    });
  });

  describe('assertNumber', () => {
    it('accepts a decimal', () => {
      expect(assertNumber('12.5', 'marks')).toBe(12.5);
    });
    it('throws on NaN', () => {
      expect(() => assertNumber('abc', 'marks')).toThrowError(/must be a number/);
    });
  });

  describe('assertBoolean', () => {
    it('accepts a boolean', () => {
      expect(assertBoolean(true, 'flag')).toBe(true);
    });
    it('does not accept the string "true"', () => {
      expect(() => assertBoolean('true', 'flag')).toThrowError(/boolean/);
    });
  });

  describe('assertDate / assertDateOrder', () => {
    it('accepts a valid date', () => {
      expect(assertDate('2026-01-01', 'start')).toBe('2026-01-01');
    });
    it('throws on invalid date', () => {
      expect(() => assertDate('not-a-date', 'start')).toThrowError(/invalid/);
    });
    it('throws when start >= end', () => {
      expect(() => assertDateOrder('2026-02-01', '2026-01-01')).toThrowError(/must be before/);
    });
    it('no error when in the correct order', () => {
      expect(() => assertDateOrder('2026-01-01', '2026-02-01')).not.toThrow();
    });
  });

  describe('assertEnum', () => {
    it('accepts an allowed value', () => {
      expect(assertEnum('MALE', 'gender', GENDERS)).toBe('MALE');
    });
    it('throws on a value outside the list', () => {
      expect(() => assertEnum('X', 'gender', GENDERS)).toThrowError(/must be one of/);
    });
  });

  describe('assertArray', () => {
    it('accepts an array', () => {
      expect(assertArray([1, 2], 'ids')).toEqual([1, 2]);
    });
    it('throws on non-array', () => {
      expect(() => assertArray('x', 'ids')).toThrowError(/must be an array/);
    });
    it('throws on an empty array (min 1)', () => {
      expect(() => assertArray([], 'ids')).toThrowError(/at least 1/);
    });
  });

  // `nullable` is what makes a PATCH able to clear a NULL-able column: the repositories skip
  // undefined fields, so a null has to survive validation as null to reach the SET clause.
  describe('nullable', () => {
    it('keeps an explicit null as null instead of undefined', () => {
      expect(assertString(null, 'phone', { required: false, nullable: true })).toBeNull();
      expect(assertDate(null, 'joining_date', { required: false, nullable: true })).toBeNull();
      expect(assertUuid(null, 'section_id', { required: false, nullable: true })).toBeNull();
      expect(assertInteger(null, 'max_capacity', { required: false, nullable: true })).toBeNull();
      expect(assertNumber(null, 'marks', { required: false, nullable: true })).toBeNull();
      expect(assertBoolean(null, 'flag', { required: false, nullable: true })).toBeNull();
      expect(assertEnum(null, 'gender', GENDERS, { required: false, nullable: true })).toBeNull();
    });
    it('still collapses null to undefined without the flag (the old default)', () => {
      expect(assertString(null, 'phone', { required: false })).toBeUndefined();
      expect(assertUuid(null, 'section_id', { required: false })).toBeUndefined();
    });
    it('nullable does not excuse an absent value when required', () => {
      expect(() => assertString(undefined, 'phone', { nullable: true })).toThrowError(/required/);
    });
    it('accepts null even when required — the key was present', () => {
      expect(assertString(null, 'phone', { nullable: true })).toBeNull();
    });
    it('still validates a non-null value', () => {
      expect(assertString('  x ', 'phone', { required: false, nullable: true })).toBe('x');
      expect(() => assertUuid('nope', 'id', { required: false, nullable: true })).toThrowError(
        /valid id/,
      );
    });
    // "" is deliberately NOT a clear signal — a blank input is more often an accident
    it('does not treat an empty string as a clear', () => {
      expect(assertString('', 'phone', { required: false, nullable: true })).toBeUndefined();
    });
  });

  // stands in for a repository's Update*Data DTO + its exported ALLOWED_UPDATE_FIELDS.
  // The `allowed` names must all be keys of the patch type — that constraint is what keeps
  // a repository's allow-list from drifting away from the interface it updates.
  describe('assertHasUpdates', () => {
    interface Patch {
      phone?: string | null;
      designation?: string;
    }
    const ALLOWED = ['phone', 'designation'] as const;

    it('passes when at least one allowed field is present', () => {
      const patch: Patch = { phone: '01711' };
      expect(() => assertHasUpdates(patch, ALLOWED)).not.toThrow();
    });
    it('throws on an empty body', () => {
      const patch: Patch = {};
      expect(() => assertHasUpdates(patch, ALLOWED)).toThrowError(/No fields to update/);
    });
    it('throws when every allowed field is undefined', () => {
      const patch: Patch = { phone: undefined, designation: undefined };
      expect(() => assertHasUpdates(patch, ALLOWED)).toThrowError(/No fields to update/);
    });
    // the misleading-404 case: keys the repository would never SET must not satisfy the guard
    it('ignores keys outside the allow-list', () => {
      const patch = { nonsense: 1 } as unknown as Patch;
      expect(() => assertHasUpdates(patch, ALLOWED)).toThrowError(/No fields to update/);
    });
    it('throws 400, and names the allowed fields', () => {
      const patch: Patch = {};
      try {
        assertHasUpdates(patch, ALLOWED);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).message).toContain('phone, designation');
      }
    });
    // null counts — the caller did send it, and on a nullable column it clears the value.
    // A non-nullable field never reaches here as null: validation maps it to undefined first.
    it('treats an explicit null as a field to update', () => {
      const patch: Patch = { phone: null };
      expect(() => assertHasUpdates(patch, ALLOWED)).not.toThrow();
    });
  });
});
