import { describe, it, expect } from 'vitest';
import { getSessionStatus } from '../session';

describe('getSessionStatus', () => {
  it('returns "scheduled" when startTime is null', () => {
    expect(getSessionStatus({ startTime: null, endTime: null })).toBe('scheduled');
  });

  it('returns "in_progress" when startTime is set but endTime is null', () => {
    expect(getSessionStatus({ startTime: '18:30', endTime: null })).toBe('in_progress');
  });

  it('returns "completed" when both startTime and endTime are set', () => {
    expect(getSessionStatus({ startTime: '18:30', endTime: '20:00' })).toBe('completed');
  });

  it('returns "cancelled" when deletedAt is set, regardless of times', () => {
    expect(getSessionStatus({ startTime: null, endTime: null, deletedAt: new Date() })).toBe('cancelled');
    expect(getSessionStatus({ startTime: '18:30', endTime: null, deletedAt: '2025-01-01T00:00:00Z' })).toBe('cancelled');
    expect(getSessionStatus({ startTime: '18:30', endTime: '20:00', deletedAt: new Date() })).toBe('cancelled');
  });

  it('treats null/undefined deletedAt as not cancelled', () => {
    expect(getSessionStatus({ startTime: null, endTime: null, deletedAt: null })).toBe('scheduled');
    expect(getSessionStatus({ startTime: null, endTime: null })).toBe('scheduled');
  });
});
