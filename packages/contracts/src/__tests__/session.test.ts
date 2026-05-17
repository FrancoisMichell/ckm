import { describe, it, expect } from 'vitest';
import { getSessionStatus } from '../session';

describe('getSessionStatus', () => {
  it('returns "scheduled" when start_time is null', () => {
    expect(getSessionStatus({ start_time: null, end_time: null })).toBe('scheduled');
  });

  it('returns "in_progress" when start_time is set but end_time is null', () => {
    expect(getSessionStatus({ start_time: '18:30', end_time: null })).toBe('in_progress');
  });

  it('returns "completed" when both start_time and end_time are set', () => {
    expect(getSessionStatus({ start_time: '18:30', end_time: '20:00' })).toBe('completed');
  });

  it('returns "cancelled" when deleted_at is set, regardless of times', () => {
    expect(getSessionStatus({ start_time: null, end_time: null, deleted_at: new Date() })).toBe('cancelled');
    expect(getSessionStatus({ start_time: '18:30', end_time: null, deleted_at: '2025-01-01T00:00:00Z' })).toBe('cancelled');
    expect(getSessionStatus({ start_time: '18:30', end_time: '20:00', deleted_at: new Date() })).toBe('cancelled');
  });

  it('treats null/undefined deleted_at as not cancelled', () => {
    expect(getSessionStatus({ start_time: null, end_time: null, deleted_at: null })).toBe('scheduled');
    expect(getSessionStatus({ start_time: null, end_time: null })).toBe('scheduled');
  });
});
