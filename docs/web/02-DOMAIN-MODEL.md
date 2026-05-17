# 02 — Domain Model

This is the **single source of truth for entities, enums, and business rules**. Both the backend (TypeORM entities + services) and the frontend (forms, displays) derive from what is documented here. Shared enums + branded ID types live in `packages/contracts`; transport DTO shapes are generated into `packages/contracts/src/api/` from the API's OpenAPI emit.

---

## Entities & relationships

```
Teacher (1) ────< Class (N) ────< ClassSession (N) ────< Attendance (N) >──── Student (1)
                       │                                                      │
                       └────────── ClassEnrollment (N) ───────────────────────┘
```

- A **Teacher** owns many **Classes**.
- A **Class** is a recurring slot. It has many **ClassEnrollments** (which Students are in the roster) and many **ClassSessions** (dated occurrences).
- A **ClassSession** has many **Attendances** (one per student who showed, plus any visitors).
- A **Student** has many **ClassEnrollments** and many **Attendances**.

---

## Entity: Student

| Field | Type | Notes |
|---|---|---|
| `id` | UUID v4 | PK. |
| `name` | string(3..100) | Letters incl. accents; trimmed. |
| `registry` | string(4..20) | Academy-internal number. Unique. Alphanumeric + `-` `_`. |
| `belt` | enum `Belt` | See below. |
| `birthday` | `YYYY-MM-DD` | Not future. Age 3..100. |
| `trainingSince` | `YYYY-MM-DD` | Not future. ≥ 1950. ≥ `birthday`. |
| `isActive` | boolean | Soft "active roster" flag. |
| `notes` | string(0..1000)? | Optional free text (v2 addition). |
| `createdAt`, `updatedAt` | ISO timestamp UTC | |

### Enum: Belt

Order matters (sorting, progression UI):

```
white → yellow → orange → green → blue → brown → black
```

Display config (FE-only, `apps/web/src/features/student/belt.ts`):

| value | label (PT) | hex |
|---|---|---|
| `white`  | Branca   | `#E5E7EB` |
| `yellow` | Amarela  | `#FBBF24` |
| `orange` | Laranja  | `#F97316` |
| `green`  | Verde    | `#10B981` |
| `blue`   | Azul     | `#2563EB` |
| `brown`  | Marrom   | `#8B6F47` |
| `black`  | Preta    | `#1F2937` |

> **Open question:** BJJ adult progression is `white→blue→purple→brown→black`. The current set uses general martial-arts kid belts. Clarify with the user before launch — they may want adult belts or a separate `level` field for kids.

### Rules
- `registry` is unique per academy.
- Students are never hard-deleted in normal use; `isActive=false` is the retire path. Admin-only hard delete for LGPD/GDPR.

---

## Entity: Class

A recurring schedule slot, not a specific lesson.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string(3..100) | e.g. "Adulto Gi — Noite". |
| `days` | `number[]` | Days of week: `0=Sun … 6=Sat`. Non-empty, unique values. |
| `startTime` | `HH:mm` | Default start. |
| `durationMinutes` | int 15..240 | Default duration. |
| `teacherId` | UUID FK → Teacher | |
| `isActive` | boolean | |
| `createdAt`, `updatedAt` | timestamps | |

### Rules
- Editing `days`/`startTime` does **not** rewrite existing sessions; sessions snapshot their own times.
- Deactivating a class hides it from lists but does NOT cancel scheduled sessions.

---

## Entity: ClassEnrollment

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `classId` | UUID FK | |
| `studentId` | UUID FK | |
| `enrolledAt` | timestamp | Defaults to now. |

Unique constraint: `(classId, studentId)`.

---

## Entity: ClassSession

A specific dated occurrence of a Class.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `classId` | UUID FK | |
| `teacherId` | UUID FK | Substitute teacher allowed. |
| `date` | `YYYY-MM-DD` | Calendar date. No TZ offset. |
| `startTime` | `HH:mm` | Scheduled start. |
| `endTime` | `HH:mm` | Scheduled end. |
| `startedAt` | timestamp? | Set when teacher hits "start". |
| `endedAt` | timestamp? | Set when teacher hits "end". |
| `notes` | string(0..1000)? | What was trained, promotions, etc. |
| `isActive` | boolean | `false` = cancelled. |
| `createdAt`, `updatedAt` | timestamps | |

### Computed status (FE-only)

| Condition | Status | Badge color |
|---|---|---|
| `!isActive` | `cancelled` | red |
| `endedAt != null` | `completed` | gray |
| `startedAt != null && endedAt == null` | `in_progress` | green |
| else | `scheduled` | blue |

### Rules
- A session may be created for any date (past or future) — useful for backfilling.
- Cannot have `endedAt` set while `startedAt` is null. Backend enforces.

---

## Entity: Attendance

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `sessionId` | UUID FK | |
| `studentId` | UUID FK | |
| `status` | enum `AttendanceStatus` | See below. |
| `notes` | string(0..500)? | Per-student note for this session. |
| `markedById` | UUID FK → Teacher? | Who recorded this (audit). v2 addition. |
| `markedAt` | timestamp? | When status last changed from `pending`. |
| `createdAt`, `updatedAt` | timestamps | |

Unique constraint: `(sessionId, studentId)`.

### Enum: AttendanceStatus

```
pending | present | late | absent | excused
```

| value | label (PT) | color |
|---|---|---|
| `pending`  | Pendente    | gray   |
| `present`  | Presente    | green  |
| `late`     | Atrasado    | yellow |
| `absent`   | Faltou      | red    |
| `excused`  | Justificado | blue   |

Sort order: `pending → present → late → absent → excused`.

### Rules
- "Prepare attendance" creates `pending` rows for every enrolled active student. Idempotent (skips existing rows).
- A visitor (non-enrolled) can have an Attendance row without being enrolled.
- Status cycles `pending → present → late → absent → excused → pending` on the FE.

---

## Entity: Teacher

The auth principal.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `name` | string(3..100) | |
| `registry` | string | Unique. Login identifier (e.g. `0001`). |
| `passwordHash` | string | bcrypt. Never returned by API. |
| `role` | enum `admin \| teacher` | |
| `isActive` | boolean | |
| `createdAt`, `updatedAt` | timestamps | |

### Rules
- `registry` is the login identifier — carried over from v1. The PT-BR login field label is "Registro".
- If the academy owner also trains: they may have both a `Teacher` row and a `Student` row. Link via optional `studentId` FK on `Teacher`.

---

## Cross-entity rules

1. **Soft-delete is the default.** Hard delete is admin-only (LGPD/GDPR compliance).
2. **`includeInactive` default:** list endpoints exclude `isActive=false` unless `includeInactive=true` or an explicit `isActive` filter is passed.
3. **Belt sort order:** enum position order; secondary sort by `name ASC`.
4. **Standard pagination:** every list returns `{ data: T[], meta: { total, page, limit, totalPages } }`. Default `page=1, limit=10`. Max `limit=100`.
5. **Dates never carry a timezone.** `date` is the academy's local calendar date. `startTime`/`endTime` are wall-clock strings. Timestamps are UTC ISO 8601.

---

## Permission model

| Role | Can do |
|---|---|
| `admin` | Everything. Manage teachers, hard-delete records. |
| `teacher` | CRUD students, classes, sessions, attendance. Cannot manage other teachers. |

A future `student` role (self-service) is anticipated but not implemented in v2.
