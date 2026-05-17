import { BadRequestException } from '@nestjs/common';

/**
 * Copy defined (non-undefined) fields from `source` onto `target`,
 * skipping keys in `excludeFields`.
 *
 * Used in update handlers so a PATCH only touches fields that the caller
 * explicitly provided.
 */
export function updateFields<T extends object>(
  target: T,
  source: Partial<T>,
  excludeFields: (keyof T)[] = [],
): T {
  for (const key of Object.keys(source) as (keyof T)[]) {
    if (excludeFields.includes(key)) continue;
    if (source[key] !== undefined) {
      target[key] = source[key] as T[keyof T];
    }
  }
  return target;
}

/**
 * Throw BadRequestException if `array` already contains an item
 * with the given `itemId`.
 */
export function ensureNotInArray<T extends { id: string }>(
  array: T[],
  itemId: string,
  errorMsg: string,
): void {
  if (array.some((x) => x.id === itemId)) {
    throw new BadRequestException(errorMsg);
  }
}

/**
 * Remove the item with `itemId` from `array` in-place.
 * Throws BadRequestException if the item is not found.
 */
export function removeFromArray<T extends { id: string }>(
  array: T[],
  itemId: string,
  errorMsg: string,
): void {
  const idx = array.findIndex((x) => x.id === itemId);
  if (idx === -1) {
    throw new BadRequestException(errorMsg);
  }
  array.splice(idx, 1);
}
