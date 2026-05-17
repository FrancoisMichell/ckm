# 03 — Frontend Spec (`apps/web`)

## Folder layout (feature-folder)

```
apps/web/
├── public/                       # PWA manifest, icons, MSW worker
├── src/
│   ├── main.tsx                  # Entry. Mounts <App />.
│   ├── app/
│   │   ├── App.tsx               # Provider stack only.
│   │   ├── providers.tsx         # QueryClient, Router, ThemeProvider, ToastProvider, AuthProvider.
│   │   └── routes/               # TanStack Router file-based routes (see below).
│   ├── features/
│   │   ├── auth/
│   │   ├── student/
│   │   ├── class/
│   │   ├── session/
│   │   └── attendance/
│   ├── components/
│   │   ├── ui/                   # shadcn primitives (button, input, dialog, etc).
│   │   └── layout/               # Header, PageContainer, Breadcrumbs.
│   ├── hooks/                    # Cross-cutting hooks (useDebouncedValue, useMediaQuery).
│   ├── lib/                      # Pure utilities (cn, formatDate, formatBelt).
│   ├── api/
│   │   ├── client.ts             # openapi-fetch instance + interceptors.
│   │   ├── generated/            # Codegen output. .gitignore'd; rebuilt on demand.
│   │   └── query-keys.ts         # Hierarchical query keys per entity.
│   ├── i18n/
│   │   ├── index.ts              # i18next setup.
│   │   └── locales/pt-BR/*.json
│   └── styles/
│       └── globals.css           # Tailwind v4 layer config + shadcn CSS variables.
└── e2e/                          # Playwright specs.
```

Each `features/<name>/` follows the same internal shape:

```
features/student/
├── api.ts                # Query/mutation hooks wrapping generated client.
├── schemas.ts            # Re-exports from packages/contracts. No duplication.
├── components/
│   ├── StudentCard.tsx
│   ├── StudentForm.tsx
│   └── StudentTable.tsx
├── hooks/                # Feature-specific hooks (e.g. useStudentFilters).
└── index.ts              # Public barrel — only what other features may import.
```

**Cross-feature imports go through `index.ts` barrels only.** A lint rule enforces this.

---

## Routes (TanStack Router, file-based)

```
routes/
├── __root.tsx                              # Root layout (providers, error boundary).
├── _auth.tsx                               # Pathless layout: requires auth, renders <Header/>.
├── _auth.index.tsx                         # /                  — Dashboard.
├── _auth.students.index.tsx                # /students          — List.
├── _auth.students.new.tsx                  # /students/new      — Create.
├── _auth.students.$id.tsx                  # /students/:id      — Detail + attendance history.
├── _auth.classes.index.tsx                 # /classes
├── _auth.classes.new.tsx
├── _auth.classes.$id.tsx                   # /classes/:id       — Detail (tabs: info, roster, sessions).
├── _auth.sessions.index.tsx                # /sessions          — Calendar + list toggle.
├── _auth.sessions.$id.tsx                  # /sessions/:id      — Session detail.
├── _auth.sessions.$id.attendance.tsx       # /sessions/:id/attendance
└── login.tsx                               # /login
```

### URL changes vs v1

| v1 (PT-BR) | v2 | Reason |
|---|---|---|
| `/cadastro` | `/students/new` | Resource-oriented; routes are an API. |
| `/aluno/:id` | `/students/:id` | Plural collection, English consistency. |
| `/turmas` | `/classes` | |
| `/turmas/:id/aulas` | `/classes/:id` (tab) | Detail page with tabs avoids extra navigation. |
| `/aulas/:id/presencas` | `/sessions/:id/attendance` | |

User-facing labels remain PT-BR via i18n; URLs are English.

---

## Page specs

### `/` — Dashboard

Three sections:
1. **Today's sessions** — sessions where `date == today`, sorted by `startTime`. Each shows class name, time, status badge, attendance count / enrolled. Primary action: "Fazer chamada" → `/sessions/:id/attendance`.
2. **Quick actions** — "Nova aula hoje", "Adicionar aluno".
3. **Stats strip** — total active students, sessions this week, attendance rate last 7 days. One `/dashboard/today` endpoint.

### `/students`

Server-paginated table.
- Debounced (300ms) filters: `name` search, `belt` multi-select chips, `isActive` toggle.
- Sort: `name | belt | trainingSince`.
- Bulk select → bulk deactivate.
- Mobile: card list at `md` breakpoint.

### `/students/:id`

Tabs: **Perfil** (edit-in-place form), **Presenças** (filtered attendance list + monthly % chart), **Turmas** (enrolled classes).

### `/classes`

Card grid. Each card: name, days-of-week pills, start time, enrolled count, teacher name.

### `/classes/:id`

Tabs: **Detalhes** (edit form), **Alunos** (roster + enroll/unenroll), **Aulas** (sessions list + "Nova aula" CTA).

### `/sessions`

Toggle: **Calendário** (month/week) | **Lista** (paginated, filterable by class/date/teacher).

### `/sessions/:id/attendance` — The core page

Mobile-first. Designed for one-thumb operation.

#### Layout (mobile)

```
┌─────────────────────────────────────┐
│ ← Adulto Gi  •  Seg 10/03  19:00    │
│ [Em andamento]  Iniciou 19:02       │
├─────────────────────────────────────┤
│ [All ▾]  🔍 Buscar                  │
│ Sort: [Nome ▾]                      │
├─────────────────────────────────────┤
│ [📋 Preparar chamada]               │  ← only if no rows yet
├─────────────────────────────────────┤
│ 🥋 João Silva     ● Presente   ⋯   │
│ 🥋 Maria Souza    ○ Pendente   ⋯   │  ← tap row to cycle status
├─────────────────────────────────────┤
│                    [+ Visitante]    │  ← floating action
└─────────────────────────────────────┘
```

#### Behaviors

- **Tap row** → cycles status. **Optimistic update** (TanStack Query mutation).
- **Long-press row** → bottom sheet with notes input + full status picker.
- **"Todos presentes"** — bulk marks all `pending` rows as `present`. Confirms first.
- **Add visitor** — dialog lists active students NOT in this session (`notInSession=:id`); search by name; creates Attendance row.
- **Start/End session** at top right. End confirms if any rows still `pending`.
- **Offline (PWA):** mutations queue in IndexedDB; header banner shows "X pendentes"; auto-sync on reconnect.

#### Keyboard (desktop)

`↑/↓` move focus; `P/L/A/E` set Present/Late/Absent/Excused; `Enter` opens notes; `/` focuses search.

---

## Data fetching patterns

### Query keys (`api/query-keys.ts`)

```ts
export const queryKeys = {
  students: {
    all: () => ['students'] as const,
    list: (params: ListStudentsParams) => ['students', 'list', params] as const,
    detail: (id: string) => ['students', 'detail', id] as const,
  },
  sessions: {
    all: () => ['sessions'] as const,
    detail: (id: string) => ['sessions', 'detail', id] as const,
    attendance: (id: string) => ['sessions', id, 'attendance'] as const,
  },
  // ...
};
```

Mutations invalidate the narrowest prefix. `updateAttendance` invalidates only `queryKeys.sessions.attendance(sessionId)`.

### Hook pattern

```ts
// features/student/api.ts
export function useStudentsQuery(params: ListStudentsParams) {
  return useQuery({
    queryKey: queryKeys.students.list(params),
    queryFn: () => apiClient.GET('/students', { params: { query: params } }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStudentInput) =>
      apiClient.POST('/students', { body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students.all() }),
  });
}
```

### Optimistic mutations (attendance)

```ts
useMutation({
  mutationFn: ({ id, status }) =>
    apiClient.PATCH('/attendance/{id}', { params: { path: { id } }, body: { status } }),
  onMutate: async ({ id, status }) => {
    await qc.cancelQueries({ queryKey: queryKeys.sessions.attendance(sessionId) });
    const prev = qc.getQueryData(queryKeys.sessions.attendance(sessionId));
    qc.setQueryData(queryKeys.sessions.attendance(sessionId), (old) =>
      old?.map(a => a.id === id ? { ...a, status } : a)
    );
    return { prev };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) qc.setQueryData(queryKeys.sessions.attendance(sessionId), ctx.prev);
    toast.error(t('attendance.update_failed'));
  },
});
```

---

## Forms

- **React Hook Form** + `zodResolver` using schemas from `packages/contracts`.
- Shared `<FormField name="..." />` wraps RHF controller + shadcn `FormItem/Label/Control/Message`.
- Submit calls mutation; on success → toast + navigate.

---

## Auth on the frontend

- **No tokens in `localStorage`.** Access JWT is held **in memory only** (Auth context state); the refresh token is persisted in **IndexedDB**. Backend issues both as JSON in the `/auth/login` and `/auth/refresh` response bodies.
- `apiClient` (`openapi-fetch`) attaches `Authorization: Bearer <access>` from the in-memory token on every request.
- On 401: call `POST /auth/refresh` with the IndexedDB-stored refresh token; on success, replace the in-memory access token and retry the original request **once**; on failure → clear refresh token → navigate to `/login`.
- `AuthProvider` exposes `user` (from `GET /auth/me`), `login`, `logout`. Zero token-handling in components.

---

## Styling, theming, i18n

- **Tailwind v4** with CSS variables for color tokens (supports dark mode).
- **shadcn/ui** copied into `src/components/ui/`.
- **Dark mode** — `ThemeProvider` + toggle in Header.
- **i18n** — all user-visible strings through `t('feature.key')`. Catalogs in `src/i18n/locales/pt-BR/*.json`.

---

## Testing strategy

| Layer | Tool | Coverage goal |
|---|---|---|
| Pure functions | Vitest | Belt sort, status cycle, formatters. |
| Hooks | Vitest + RTL | Filter hooks, debounce. |
| Components | Vitest + RTL + MSW | Forms, tables, cards — happy path + one error state each. |
| Pages | RTL + MSW | Smoke test per route. |
| E2E | Playwright | login → attendance flow → logout. |

MSW handlers live in `src/test/msw/` and use generated types — cannot drift from the contract.

---

## PWA / offline

- `vite-plugin-pwa` with `injectManifest` strategy.
- Precache: app shell, static assets, current week's session data.
- Mutation queue: TanStack Query `persistQueryClient` + custom `online-manager`; header shows "X pendentes".
- Cache strategy: `NetworkFirst` for API GETs (1h stale fallback); `CacheFirst` for static assets.
