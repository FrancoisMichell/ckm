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
  startTime: string | null;
  endTime: string | null;
  deletedAt?: Date | string | null;
}

export function getSessionStatus(session: SessionForStatus): SessionStatus {
  if (session.deletedAt != null) return 'cancelled';
  if (session.startTime == null) return 'scheduled';
  if (session.endTime == null) return 'in_progress';
  return 'completed';
}
