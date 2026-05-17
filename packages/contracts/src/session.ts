export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

export type SessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface SessionForStatus {
  start_time: string | null;
  end_time: string | null;
  deleted_at?: Date | string | null;
}

export function getSessionStatus(session: SessionForStatus): SessionStatus {
  if (session.deleted_at != null) return 'cancelled';
  if (session.start_time == null) return 'scheduled';
  if (session.end_time == null) return 'in_progress';
  return 'completed';
}
