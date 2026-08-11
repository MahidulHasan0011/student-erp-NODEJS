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
  GENDERS,
} from '../../src/utils/validators.js';

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
        expect(e.statusCode).toBe(400);
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
});
