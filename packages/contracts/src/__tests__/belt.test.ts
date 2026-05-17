import { describe, it, expect } from 'vitest';
import { Belt, beltRank, compareBelts, BELT_CONFIGS } from '../belt';

describe('beltRank', () => {
  it('returns 1 for WHITE and 7 for BLACK', () => {
    expect(beltRank(Belt.WHITE)).toBe(1);
    expect(beltRank(Belt.BLACK)).toBe(7);
  });

  it('returns ranks in strictly ascending order across all belts', () => {
    const belts = [Belt.WHITE, Belt.YELLOW, Belt.ORANGE, Belt.GREEN, Belt.BLUE, Belt.BROWN, Belt.BLACK];
    for (let i = 0; i < belts.length - 1; i++) {
      expect(beltRank(belts[i])).toBeLessThan(beltRank(belts[i + 1]));
    }
  });
});

describe('compareBelts', () => {
  it('returns negative when a is lower rank than b', () => {
    expect(compareBelts(Belt.WHITE, Belt.BLUE)).toBeLessThan(0);
  });

  it('returns positive when a is higher rank than b', () => {
    expect(compareBelts(Belt.BLACK, Belt.BROWN)).toBeGreaterThan(0);
  });

  it('returns 0 for equal belts', () => {
    expect(compareBelts(Belt.GREEN, Belt.GREEN)).toBe(0);
  });

  it('sorts an array white→black correctly', () => {
    const shuffled = [Belt.BLACK, Belt.WHITE, Belt.BLUE, Belt.YELLOW];
    const sorted = [...shuffled].sort(compareBelts);
    expect(sorted).toEqual([Belt.WHITE, Belt.YELLOW, Belt.BLUE, Belt.BLACK]);
  });
});

describe('BELT_CONFIGS', () => {
  it('has an entry for every Belt value', () => {
    for (const belt of Object.values(Belt)) {
      expect(BELT_CONFIGS[belt]).toBeDefined();
      expect(BELT_CONFIGS[belt].label).toBeTruthy();
      expect(BELT_CONFIGS[belt].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('labels are in PT-BR', () => {
    expect(BELT_CONFIGS[Belt.WHITE].label).toBe('Branca');
    expect(BELT_CONFIGS[Belt.BLACK].label).toBe('Preta');
  });
});
