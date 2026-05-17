# 03 — API

REST API, JSON only, mounted at the application root (no `/api/v1` prefix — Swagger UI lives at `GET /api`).

## Conventions

- **Auth**: every endpoint requires a valid access token (JWT in `Authorization: Bearer <token>`) AND the `TEACHER` role, EXCEPT routes explicitly marked **Public**.
- **Content type**: requests and responses use `application/json`. Errors use `application/problem+json` (RFC 7807).
- **IDs**: UUID v4 throughout. Path-level UUIDs are validated by `ParseUUIDPipe`.
- **Pagination**: `?page=<1-based>&limit=<n>` (defaults 1 / 10). Response wraps the array as `{ data, meta: { page, limit, total, totalPages } }`.
- **Soft-delete query semantics**: list endpoints take `?includeDeleted=true|false` (default `false`). Replaces v1's mixed `isActive` / `includeInactive` query parameters with one consistent name.
- **Time formats**: `time` columns serialize as `"HH:MM"`. `date` columns as `"YYYY-MM-DD"`. Timestamps as ISO 8601.

## Error response (RFC 7807)

All non-2xx responses use this shape (content-type `application/problem+json`):

```json
{
  "type": "https://api.seirin.dev/problems/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields failed validation.",
  "instance": "/students",
  "errors": [
    { "field": "belt", "message": "belt must be a valid enum value" }
  ]
}
```

`errors[]` is only present for 422 validation failures. `instance` echoes the request path. See [05-architecture-and-conventions.md](05-architecture-and-conventions.md#problem-details-error-handling) for the filter implementation.

## Auth (`/auth`)

| Method | Path             | Auth   | Body                                | Response (200)                                              |
| ------ | ---------------- | ------ | ----------------------------------- | ----------------------------------------------------------- |
| POST   | `/auth/login`    | Public | `{ registry, password }`            | `{ accessToken, refreshToken, user }`                       |
| POST   | `/auth/refresh`  | Public | `{ refreshToken }`                  | `{ accessToken, refreshToken }` (refresh rotated)           |
| POST   | `/auth/logout`   | JWT    | `{ refreshToken }`                  | 204                                                         |
| GET    | `/auth/me`       | JWT    | —                                   | Current user (`User`, with roles, instructor, enrolledClasses) |

- `accessToken` TTL **15 min**. `refreshToken` TTL **30 days**.
- `POST /auth/login` is rate-limited to **5 requests / 60 s**.
- `POST /auth/refresh`: if the supplied token was already consumed (rotated), revoke its entire family and return 401.
- See [04-auth-and-rbac.md](04-auth-and-rbac.md) for full details.

> **v2 change**: replaces v1's `POST /teacher/login` + `GET /teacher/me` (which returned `{ token, user }` with a 60-min token, no refresh).

## Students (`/students`)

All routes require `TEACHER` role. Queries are auto-scoped to `instructor_id = currentUser.id` so a teacher only sees their own students.

| Method | Path             | Body / Query                                     | Response                                                      |
| ------ | ---------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| POST   | `/students`      | `CreateStudentDto`                               | 201, `User` (with `STUDENT` role, instructor_id = caller)     |
| GET    | `/students`      | `QueryStudentsDto`                               | 200, `{ data: User[], meta }`                                 |
| GET    | `/students/:id`  | —                                                | 200, `User`. 404 if not found or not owned by caller.         |
| PATCH  | `/students/:id`  | `UpdateStudentDto`                               | 200, `User`                                                   |
| DELETE | `/students/:id`  | —                                                | 204. Soft-delete (sets `deleted_at`).                         |

### `CreateStudentDto`

```ts
{
  name: string;                 // required, non-empty
  registry?: string;            // optional, unique if provided
  belt: Belt;                   // required, enum
  birthday?: string;            // optional, "YYYY-MM-DD"
  trainingSince?: string;       // optional, "YYYY-MM-DD"
}
```

### `UpdateStudentDto`

Partial of `CreateStudentDto`. Does NOT accept an `isActive` flag — use DELETE / restore endpoints for soft-delete state changes (out of scope for v1 if not needed).

### `QueryStudentsDto`

| Param                | Type                              | Notes                                                          |
| -------------------- | --------------------------------- | -------------------------------------------------------------- |
| `page`               | int ≥ 1, default 1                |                                                                |
| `limit`              | int ≥ 1, default 10               |                                                                |
| `name`               | string                            | Partial, case-insensitive (`LOWER(name) LIKE LOWER(%v%)`).     |
| `registry`           | string                            | Partial, case-insensitive.                                     |
| `belts`              | `Belt[]`                          | Repeat `belts=white&belts=yellow` or comma-separated.          |
| `includeDeleted`     | boolean, default false            | Replaces v1's `isActive`.                                      |
| `notEnrolledInClass` | UUID                              | Exclude students currently enrolled in this class.             |
| `notInSession`       | UUID                              | Exclude students that already have an attendance for this session. |
| `sortBy`             | `name` \| `registry` \| `belt` \| `createdAt`, default `name` | When `belt`, sort by belt rank (white→black) then by `name` ASC. |
| `sortOrder`          | `ASC` \| `DESC`, default `ASC`    |                                                                |

Exclusion filters implement the LEFT JOIN + IS NULL pattern; see [05-architecture-and-conventions.md](05-architecture-and-conventions.md#queryBuilder-pattern). Both `notEnrolledInClass` and `notInSession` 404 if the referenced ID doesn't exist.

## Classes (`/classes`)

All routes require `TEACHER`. `GET` routes are scoped to the caller's `teacher_id`.

| Method | Path                                  | Body                  | Response                          |
| ------ | ------------------------------------- | --------------------- | --------------------------------- |
| POST   | `/classes`                            | `CreateClassDto`      | 201, `Class`                      |
| GET    | `/classes`                            | `{ page, limit, includeDeleted }` | 200, `{ data: Class[], meta }` |
| GET    | `/classes/:id`                        | —                     | 200, `Class`. 404 if not owned.   |
| PATCH  | `/classes/:id`                        | `UpdateClassDto`      | 200, `Class`                      |
| DELETE | `/classes/:id`                        | —                     | 204. Soft-delete.                 |
| POST   | `/classes/:id/restore`                | —                     | 200, `Class`. Clears `deleted_at`. |
| POST   | `/classes/:id/enroll/:studentId`      | —                     | 201, `Class` (with `enrolledStudents`). 409 if already enrolled. |
| DELETE | `/classes/:id/enroll/:studentId`      | —                     | 204. 404 if not enrolled.         |

> **v2 change**: v1 had `PATCH /classes/:id/activate` + `/deactivate` driving the `isActive` boolean. v2 collapses these to standard `DELETE` (soft-delete) + `POST /restore`. The Bruno collection should be updated.

### `CreateClassDto`

```ts
{
  name: string;                 // non-empty
  days: DayOfWeek[];            // length 1-7, values 0-6
  startTime: string;            // "HH:MM" (24h), regex ^([0-1]\d|2[0-3]):([0-5]\d)$
  durationMinutes: number;      // 30-300
}
```

`teacher_id` is taken from the JWT, not the body.

### `UpdateClassDto`

Partial of `CreateClassDto`. No `isActive`.

## Class Sessions (`/class-sessions`)

All routes require `TEACHER`. Queries scoped to caller's owned classes.

| Method | Path                                          | Body / Query                | Response                          |
| ------ | --------------------------------------------- | --------------------------- | --------------------------------- |
| POST   | `/class-sessions`                             | `CreateClassSessionDto`     | 201, `ClassSession`. 409 if `(class_id, date)` already exists. |
| GET    | `/class-sessions`                             | `FindAllClassSessionsDto`   | 200, `ClassSession[]` (no pagination) |
| GET    | `/class-sessions/by-class/:classId`           | `{ includeDeleted }`        | 200, `ClassSession[]`             |
| GET    | `/class-sessions/by-teacher/:teacherId`       | `{ includeDeleted }`        | 200, `ClassSession[]`             |
| GET    | `/class-sessions/by-date-range`               | `FindByDateRangeDto`        | 200, `ClassSession[]`             |
| GET    | `/class-sessions/:id`                         | —                           | 200, `ClassSession`               |
| PATCH  | `/class-sessions/:id`                         | `UpdateClassSessionDto`     | 200, `ClassSession`               |
| PATCH  | `/class-sessions/:id/start`                   | —                           | 200, `ClassSession` (sets `start_time` = now()) |
| PATCH  | `/class-sessions/:id/end`                     | —                           | 200, `ClassSession` (sets `end_time` = now()) |
| DELETE | `/class-sessions/:id`                         | —                           | 204. Soft-delete.                 |
| POST   | `/class-sessions/:id/restore`                 | —                           | 200, `ClassSession`               |

> **v2 change**: v1's `activate` / `deactivate` PATCH routes are dropped (replaced by DELETE + `/restore`).

### `CreateClassSessionDto`

```ts
{
  date: string;                 // "YYYY-MM-DD", required
  startTime?: string;           // "HH:MM"
  endTime?: string;             // "HH:MM"
  notes?: string;               // ≤ 500 chars
  classId: string;              // UUID, required
  teacherId: string;            // UUID, required (allows substitutes)
}
```

### `FindAllClassSessionsDto`

```ts
{
  classId?: UUID;
  teacherId?: UUID;
  startDate?: "YYYY-MM-DD";
  endDate?: "YYYY-MM-DD";
  includeDeleted?: boolean;
}
```

### `FindByDateRangeDto`

```ts
{
  startDate: "YYYY-MM-DD";      // required
  endDate: "YYYY-MM-DD";        // required
  includeDeleted?: boolean;
}
```

## Attendances (`/attendances`)

All routes require `TEACHER`. Queries scoped to caller's owned sessions/students.

| Method | Path                                       | Body / Query                                                         | Response                                |
| ------ | ------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------- |
| POST   | `/attendances`                             | `CreateAttendanceDto`                                                | 201, `Attendance`. 409 on duplicate `(session, student)`. |
| POST   | `/attendances/bulk/:sessionId`             | —                                                                    | 201, `Attendance[]`. Creates one PENDING record per enrolled student, in a transaction. Idempotent (skips students that already have a record). |
| GET    | `/attendances`                             | `{ sessionId?, studentId?, status?, isEnrolledClass? }`              | 200, `Attendance[]`                     |
| GET    | `/attendances/session/:sessionId`          | —                                                                    | 200, `Attendance[]`                     |
| GET    | `/attendances/student/:studentId`          | `{ page, limit }`                                                    | 200, `{ data: Attendance[], meta }`     |
| GET    | `/attendances/:id`                         | —                                                                    | 200, `Attendance`                       |
| PATCH  | `/attendances/:id`                         | `UpdateAttendanceDto`                                                | 200, `Attendance`. Sets `checkedInAt = now()` if new status is `PRESENT` or `LATE` and `checkedInAt` is null. |
| PATCH  | `/attendances/:id/mark-present`            | —                                                                    | 200, `Attendance`                       |
| PATCH  | `/attendances/:id/mark-late`               | —                                                                    | 200, `Attendance`                       |
| PATCH  | `/attendances/:id/mark-absent`             | —                                                                    | 200, `Attendance`                       |
| PATCH  | `/attendances/:id/mark-excused`            | —                                                                    | 200, `Attendance`                       |
| DELETE | `/attendances/:id`                         | —                                                                    | 204. Soft-delete.                       |

### `CreateAttendanceDto`

```ts
{
  sessionId: string;            // UUID, required
  studentId: string;            // UUID, required
  status?: AttendanceStatus;    // default PENDING
  notes?: string;
}
```

The service computes `is_enrolled_class` from `class_enrollments` at insert time. If `status` is `PRESENT`/`LATE`, `checked_in_at` is auto-set.

### `UpdateAttendanceDto`

```ts
{
  status?: AttendanceStatus;
  notes?: string;
}
```

## Health (`/health`)

| Method | Path      | Auth   | Response                                          |
| ------ | --------- | ------ | ------------------------------------------------- |
| GET    | `/health` | Public | 200 if app + DB reachable; 503 otherwise.         |

Use `@nestjs/terminus` with a TypeOrm health indicator.

## Response shapes — common types

### `User` (response)

```ts
{
  id: string;
  name: string;
  registry: string | null;
  belt: Belt;
  birthday: string | null;        // "YYYY-MM-DD"
  trainingSince: string | null;
  createdAt: string;              // ISO 8601
  updatedAt: string;
  roles: { role: UserRoleType }[];
  instructor?: { id, name };      // included on GET /auth/me, GET /students/:id
  enrolledClasses?: { id, name, days, startTime }[];
  // password is @Exclude()d — never serialized.
  // deletedAt is @Exclude()d unless includeDeleted is requested.
}
```

### `Class` (response)

```ts
{
  id; name; days; startTime; durationMinutes;
  teacher: { id, name };
  enrolledStudents?: User[];      // included on enrollment endpoints
  createdAt; updatedAt;
}
```

### `ClassSession` (response)

```ts
{
  id; date; startTime; endTime; notes;
  class: { id, name };
  teacher: { id, name };
  createdAt; updatedAt;
}
```

### `Attendance` (response)

```ts
{
  id; isEnrolledClass; status; checkedInAt; notes;
  session: { id, date, class: { id, name } };
  student: { id, name };
  createdAt; updatedAt;
}
```
