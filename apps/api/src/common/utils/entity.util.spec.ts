/**
 * Unit tests for EntityUtil helper functions (M9.6 — coverage hardening).
 */
import { BadRequestException } from '@nestjs/common';
import { updateFields, ensureNotInArray, removeFromArray } from './entity.util';

describe('EntityUtil', () => {
  // -------------------------------------------------------------------------
  // updateFields
  // -------------------------------------------------------------------------

  describe('updateFields', () => {
    it('copies defined fields from source onto target', () => {
      const target = { name: 'Alice', age: 30 };
      const result = updateFields(target, { name: 'Bob' });

      expect(result.name).toBe('Bob');
      expect(result.age).toBe(30); // untouched
    });

    it('does not copy undefined values', () => {
      const target = { name: 'Alice', age: 30 };
      updateFields(target, { name: undefined, age: 25 });

      expect(target.name).toBe('Alice'); // untouched (undefined)
      expect(target.age).toBe(25);
    });

    it('skips keys in excludeFields', () => {
      const target = { name: 'Alice', role: 'admin' };
      updateFields(target, { name: 'Bob', role: 'user' }, ['role']);

      expect(target.name).toBe('Bob');
      expect(target.role).toBe('admin'); // excluded
    });

    it('returns the target (mutates in place and returns)', () => {
      const target = { x: 1 };
      const result = updateFields(target, { x: 2 });

      expect(result).toBe(target);
    });
  });

  // -------------------------------------------------------------------------
  // ensureNotInArray
  // -------------------------------------------------------------------------

  describe('ensureNotInArray', () => {
    it('does not throw when item is absent from the array', () => {
      const array = [{ id: 'a' }, { id: 'b' }];

      expect(() => ensureNotInArray(array, 'c', 'Already in array')).not.toThrow();
    });

    it('throws BadRequestException when item is present', () => {
      const array = [{ id: 'a' }, { id: 'b' }];

      expect(() => ensureNotInArray(array, 'a', 'Item exists')).toThrow(
        BadRequestException,
      );
    });

    it('throws with the provided error message', () => {
      const array = [{ id: 'x' }];

      expect(() =>
        ensureNotInArray(array, 'x', 'Custom error'),
      ).toThrowError('Custom error');
    });
  });

  // -------------------------------------------------------------------------
  // removeFromArray
  // -------------------------------------------------------------------------

  describe('removeFromArray', () => {
    it('removes the item in-place and leaves other items intact', () => {
      const array = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      removeFromArray(array, 'b', 'Not found');

      expect(array).toHaveLength(2);
      expect(array.map((x) => x.id)).toEqual(['a', 'c']);
    });

    it('throws BadRequestException when item is not found', () => {
      const array = [{ id: 'a' }];

      expect(() => removeFromArray(array, 'z', 'Not found')).toThrow(
        BadRequestException,
      );
    });

    it('throws with the provided error message', () => {
      const array: { id: string }[] = [];

      expect(() =>
        removeFromArray(array, 'x', 'Custom not found'),
      ).toThrowError('Custom not found');
    });
  });
});
