/**
 * Backend-local enums mirroring packages/contracts.
 * These values must stay in sync with the contracts package.
 * Belt strings match the DB enum type belt_enum.
 */

export enum Belt {
  WHITE = 'white',
  YELLOW = 'yellow',
  ORANGE = 'orange',
  GREEN = 'green',
  BLUE = 'blue',
  BROWN = 'brown',
  BLACK = 'black',
}

export enum AttendanceStatus {
  PENDING = 'PENDING',
  PRESENT = 'PRESENT',
  LATE = 'LATE',
  ABSENT = 'ABSENT',
  EXCUSED = 'EXCUSED',
}

export enum DayOfWeek {
  SUNDAY = '0',
  MONDAY = '1',
  TUESDAY = '2',
  WEDNESDAY = '3',
  THURSDAY = '4',
  FRIDAY = '5',
  SATURDAY = '6',
}

export enum UserRoleType {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
}
