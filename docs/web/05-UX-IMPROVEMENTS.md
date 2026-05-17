# 05 — UX Improvements over v1

This document describes concrete changes we are intentionally making compared to the v1 app. Agents should implement v2 from scratch with these behaviors built in — do not port v1 patterns.

---

## 1. Navigation & Information Architecture

### v1 problem
Routes were Portuguese strings (`/turmas`, `/aulas`, `/cadastro`). The nested relationship between classes and sessions required navigating to a separate page (`/turmas/:id/aulas`) instead of being accessible from the class detail itself.

### v2 change
- English resource-based URLs (labels stay PT-BR via i18n).
- `/classes/:id` has **tabs**: Detalhes, Alunos, Aulas. No separate route for sessions-by-class.
- `/students/:id` has **tabs**: Perfil, Presenças, Turmas. Student history is one click from the roster, not buried.
- **Breadcrumbs on every page** (not just some). Auto-generated from the TanStack Router tree.
- **Dashboard as the home page** — not just the student list. Teachers land on "today's sessions" to immediately take attendance.

---

## 2. Attendance Flow (highest priority)

### v1 problems
- Attendance was desktop-biased; rows had too many small buttons.
- No offline support — Wi-Fi issues in gyms caused data loss.
- "Prepare attendance" had no confirmation, no feedback, no idempotency indicator.
- Adding a visitor required two modals and multiple clicks.
- No way to quickly mark "everyone present" for high-attendance sessions.

### v2 changes

#### Mobile-first layout
- Full-width rows; touch target minimum 48×48px.
- Status badge is the primary tap target (the whole left half of the row cycles status).
- Row shows belt color indicator + name + status — nothing else visible without long-press.

#### Optimistic status cycling
- Status changes reflect instantly in the UI. The PATCH fires in the background.
- Rollback with a toast on network error — user sees what failed.

#### Quick actions
- **"Todos presentes"** button: one tap (with confirm sheet) marks all `pending` rows `present`. Huge time saver.
- **Keyboard shortcuts** (desktop): `P`, `L`, `A`, `E` for each status; `↑↓` to navigate rows.

#### Offline mode
- Attendance mutations queue locally (IndexedDB + TanStack Query persistence).
- Header badge counts pending sync operations.
- Auto-syncs when connection restores. Conflict strategy: last-write-wins (server timestamp).

#### Visitor flow
- "Adicionar visitante" opens a bottom sheet (not a modal) with live search filtered to students NOT already in the session.
- One tap to confirm — attendance row created immediately with status `present`.

---

## 3. Student Management

### v1 problems
- Student list was cards only; hard to scan on desktop.
- Belt filter was a dropdown (one selection); multi-belt filtering needed.
- No inline stats — had to navigate to see a student's attendance rate.

### v2 changes
- **Table / card toggle** (table is default on desktop, cards on mobile).
- **Belt filter as chips** — multi-select; e.g. "white + yellow" for beginners group.
- **Inline attendance rate** on student cards/rows (last 30 days, color-coded: green ≥80%, yellow 60–79%, red <60%).
- **Student detail tabs** instead of a flat edit form — profile, history, and enrolled classes in one place.
- **Soft-delete with undo** — deactivating a student shows a toast with "Desfazer" for 5 seconds.

---

## 4. Class Management

### v1 problems
- Class card showed days as numbers (`[1, 3, 5]`), requiring user to mentally map to weekdays.
- Creating a class and its first session were separate flows with no guidance.
- Enrolled students count not visible from the list.

### v2 changes
- Days displayed as abbreviated weekday pills: **Seg / Qua / Sex**.
- "Nova aula" CTA inside `/classes/:id` (Aulas tab) pre-fills date from today and times from the class defaults — minimal friction.
- Class cards show: enrolled count, last session date, next scheduled date.
- **"Agendar aulas do mês"** bulk action: given a class, pre-create sessions for all scheduled days in a month. Each session inherits class defaults.

---

## 5. Session Management

### v1 problems
- Session list had no calendar view; hard to see coverage at a glance.
- Session status badge was derived inconsistently between list and detail views.
- No way to add notes at session end; notes field only in the edit form.

### v2 changes
- **Calendar view** (month/week toggle) as default for `/sessions`. Color-coded dots per day by status.
- Status derived from a **single pure function** `getSessionStatus(session)` used in all views.
- **Quick notes** on the attendance page — teachers can add session notes inline without leaving attendance flow.
- Session **history diff**: if start/endTime differ from scheduled, show both in the detail view ("Planejado 19:00 | Real 19:08").

---

## 6. Auth & Security

### v1 problems
- Token stored in `localStorage` — XSS risk.
- Session expiry caused an abrupt navigation-flash without explanation.

### v2 changes
- **No tokens in `localStorage`** — access JWT held in memory only; refresh token persisted in IndexedDB; Bearer header on every request.
- **Login continues to use `registry`** — carried over from v1 (`Registro` field, PT-BR). Frontend never knows the password after submit.
- **Graceful session expiry** — interceptor catches 401, attempts silent refresh, then shows a modal "Sua sessão expirou. Faça login novamente." without data loss; pending form values preserved in sessionStorage, restored after re-login.
- **Password strength indicator** on first-time setup.

---

## 7. Accessibility & Theming

### v1 problems
- Custom Modal lacked `role="dialog"`, focus trap, and `aria-labelledby`.
- No dark mode.
- Color-only status indicators (no icon/text fallback) failed for colorblind users.

### v2 changes
- **shadcn/ui** provides correct ARIA roles, focus management, and keyboard interaction for all primitive components.
- **Dark mode** toggle in the header. Preference persisted in `localStorage`.
- All status indicators use **color + icon + text label**. Example: ✓ Presente, ✗ Faltou, ⏱ Atrasado, ✉ Justificado.
- Focus ring visible and consistent (Tailwind `ring` utilities).

---

## 8. Performance

### v1 problems
- All hooks hand-written with SWR; cache keys inconsistent; stale data on navigation.
- Student list re-fetched on every mount.
- No loading skeletons on attendance page — blank flash while fetching.

### v2 changes
- **Generated API client** — types derived from OpenAPI, one source of truth.
- **TanStack Query** with hierarchical keys and `placeholderData: keepPreviousData` — no flash when paginating.
- **Skeletons everywhere** — every list/table/card has a skeleton state matching the real layout (no layout shift).
- **Lazy routes** — TanStack Router code-splits each route automatically.

---

## 9. Empty States & Error Handling

### v1 problems
- Some pages showed a blank screen on empty data; others showed an unstyled message.
- API errors showed a generic "Erro" without actionable guidance.

### v2 changes
- **Every list page has an explicit `<EmptyState />`** with an illustration, a clear message, and a primary action CTA.
- **Error states are distinct from empty states.** Failed fetch → retry button + error message from error code. Empty collection → "Nenhum aluno cadastrado ainda. Adicionar primeiro aluno →".
- Error codes from the API map to specific user-friendly messages via i18n catalog (not generic "something went wrong").
