# 00 — Project Overview

## What is Mestre Kame?

Mestre Kame is a management application for **Brazilian Jiu-Jitsu (BJJ) academies**. It helps a small team (typically one head instructor and assistants) run the day-to-day:

- Keep a roster of **students** with their belt rank, registration data, and active/inactive status.
- Define **classes** (recurring weekly schedule slots, e.g. "Adult Gi — Mon/Wed/Fri 19:00").
- Track each **class session** (a specific dated occurrence of a class).
- Take **attendance** for each session — fast, on a phone or tablet, during/after training.
- (Future) generate progression and frequency reports.

## Why a v2?

The v1 frontend grew organically. It works, but it has accumulated friction worth eliminating:

| Pain point in v1 | Why it matters | Fix in v2 |
|---|---|---|
| Hand-written SWR hooks for every endpoint | Drift between FE and BE shapes; manual cache invalidation; verbose. | Generate the API client from a single source of truth (Zod + OpenAPI). |
| Tokens in `localStorage` | XSS-exposed. | Access JWT held in-memory only; refresh token persisted in IndexedDB; Bearer header on every request. |
| Manual validation utils everywhere | Easy to forget, duplicated rules. | Zod schemas shared FE/BE; React Hook Form on the FE; Nest pipe on the BE. |
| Custom Modal/Button primitives | Reinventing accessibility every time. | shadcn/ui (Radix under the hood). |
| Attendance flow requires online | Wi-Fi at gyms is unreliable. | Offline-first PWA; queue mutations; sync on reconnect. |
| Components grouped by type | Hard to grep features. | Feature-folder layout. |
| Mock Service Worker drift from real API | Two implementations of the same logic. | Single contract; the mock IS the contract during dev. |

## Users & primary scenarios

- **Instructor (primary):** logs in, opens today's session on a phone, takes attendance with one tap per student, sometimes adds a visitor mid-class.
- **Academy admin:** creates classes, enrolls students, manages roster on a desktop.
- **Future: student-facing view:** see own attendance history and belt progression (not in v2 scope).

## Quality bar (non-negotiable)

1. **Accessible.** Keyboard navigable; correct ARIA; color contrast AA. shadcn primitives give us most of this for free, but we audit.
2. **Mobile-first attendance.** The `/sessions/:id/attendance` route must be usable one-handed on a 5" phone.
3. **Type-safe end to end.** No `any` outside well-justified boundaries. FE types are *inferred* from BE schemas, not duplicated.
4. **Tested at the seams.** Vitest for units; Testing Library for components; Playwright for the critical attendance flow; Nest e2e tests for API.
5. **Bilingual-ready.** Strings live in i18n catalogs. v2 ships PT-BR only but the structure supports adding en-US later without refactor.

## Out of scope for v2

- Payments / billing.
- Self-service student registration.
- Push notifications.
- Native mobile apps.
- Multi-tenant SaaS (assume one academy per deployment).
