# CKM Project Runbook

Session-by-session operational guide for building the CKM monorepo (NestJS + React PWA) from
zero to v1.0.0. **~60 sessions total** across 20 milestones.

This file is the canonical execution playbook. The detailed plan lives at
`C:\Users\franc\.claude\plans\i-want-to-recreate-virtual-pillow.md` — read it for the *why*; this
file is the *how*.

## File location

- **During planning (now)**: `C:\Users\franc\.claude\plans\RUNBOOK.md` (alongside the plan)
- **In the monorepo (post-M0)**: `ckm/RUNBOOK.md` — copied as part of M0 sub-step 0.5

When the `ckm/` repo exists, copy this file there and delete the plans-folder copy (or keep it as a
backup). The repo copy becomes the live, updated-by-agents version.

## How to use this runbook

1. **Open a fresh Claude Code chat** for each session listed below. The boundaries matter — they
   keep context windows focused.
2. **Set the model** (`/model opus` or `/model sonnet`) as noted per session. The auto-check
   instruction in `CLAUDE.md` will warn you if you forget.
3. **Paste the prompt block verbatim** into the new chat. Each session's prompt is self-contained
   — it tells the agent what to read and what to do.
4. **At session end**, mark the checkbox in the Progress tracker below. Commit the runbook
   alongside the session's code commit so progress travels with the branch.
5. **Trust the verification lines** in the plan. A sub-step isn't "done" until its verification is
   green. Don't advance with red state.

## How to update this runbook

Future agents and humans both write to this file:

- **At the end of each session**, mark the session's checkbox in the Progress tracker and update
  the "Next session" pointer.
- **If a session splits unexpectedly** (e.g. context filled at sub-step 5.4 instead of 5.6), add
  a new sub-row like "Session 17b — M5 continuation (5.5–5.6)" and update the tracker.
- **If a milestone reveals an unforeseen scope** that warrants a new session or a model change,
  edit that milestone's section here AND note the change in the plan's milestone block.
- **Do not delete completed session blocks** — they're the audit trail. Mark them done; leave the
  prompts intact.
- **Conventional Commits** for runbook updates: `docs(runbook): mark session N complete` or
  `docs(runbook): add session 17b for M5 split`.

---

## Progress tracker

Total sessions: ~60. Mark each box as you complete the session.

### Phase 1 — Backend (M0–M9 → tag `v0.1.0-api-complete`)

- [x] Session 1 — M0 scaffold infrastructure (Opus) — done 2026-05-17
- [x] Session 2 — M0 docs + CLAUDE.md + agents + CI (Opus) — done 2026-05-17
- [ ] Session 3 — M0 audit + PR (Sonnet, no skill)
- [ ] Session 4 — M1 contracts work (Sonnet)
- [ ] Session 5 — M1 audit + PR (Sonnet, no skill)
- [ ] Session 6 — M2 NestJS scaffold + config + common scaffolding (Sonnet)
- [ ] Session 7 — M2 error handling + logger + Dockerfile (Sonnet)
- [ ] Session 8 — M2 audit + PR (Sonnet + skill)
- [ ] Session 9 — M3a Users data layer work (Sonnet)
- [ ] Session 10 — M3a audit + PR (Sonnet + skill)
- [ ] Session 11 — M3b Auth foundation 3b.1–3b.6 (Sonnet)
- [ ] Session 12 — M3b mid-milestone audit (Opus + skill)
- [ ] Session 13 — M3b controller + e2e 3b.7 (Sonnet)
- [ ] Session 14 — M3b final audit + PR (Opus + skill)
- [ ] Session 15 — M4 Students work (Sonnet)
- [ ] Session 16 — M4 audit + PR (Sonnet + skill)
- [ ] Session 17 — M5 Classes + enrollments work (Sonnet)
- [ ] Session 18 — M5 audit + PR (Sonnet + skill)
- [ ] Session 19 — M6 ClassSessions work (Sonnet)
- [ ] Session 20 — M6 audit + PR (Sonnet + skill)
- [ ] Session 21 — M7 Attendances work (Sonnet)
- [ ] Session 22 — M7 audit + PR (Opus + skill — PII + audit invariant)
- [ ] Session 23 — M8 Health + wiring + seeds work (Sonnet)
- [ ] Session 24 — M8 audit + PR (Sonnet + skill)
- [ ] Session 25 — M9 e2e hardening 9.1–9.4 (Sonnet)
- [ ] Session 26 — M9 problem-json + coverage + CI 9.5–9.7 (Sonnet)
- [ ] Session 27 — **M9 tag audit (full-codebase) + PR + `v0.1.0-api-complete` tag** (Opus + skill)

### Phase 2 — Frontend foundation + design system (M10–M11b)

- [ ] Session 28 — M10 contracts v1 + Vite scaffold 10.1–10.4 (Sonnet)
- [ ] Session 29 — M10 API client + auth + i18n + MSW 10.5–10.8 (Sonnet)
- [ ] Session 30 — M10 audit + PR (Sonnet + skill — token storage matters)
- [ ] **🎨 Drop visual references into `docs/web/design-references/` before Session 31**
- [ ] Session 31 — M11a spec preamble + identity 11a.1–11a.2 (Opus, user signoff)
- [ ] Session 32 — M11a scales + component playbook 11a.3–11a.4 (Opus, user signoff)
- [ ] Session 33 — M11a tokens.css + motion.ts 11a.5–11a.6 (Sonnet)
- [ ] Session 34 — M11a audit + PR (Sonnet, no skill — markdown spec)
- [ ] Session 35 — M11b primitives wave 1: 11b.1–11b.4 (Sonnet)
- [ ] Session 36 — M11b layout + ESLint rule + `/__design/` 11b.5–11b.7 (Sonnet)
- [ ] Session 37 — **M11b audit + PR + `v0.2.0-design-system` tag** (Sonnet + skill)

### Phase 3 — Feature surfaces (M12–M15)

- [ ] Session 38 — M12 mockup gate (Opus, mockup-author)
- [ ] Session 39 — M12 login + e2e 12.1–12.3 (Sonnet)
- [ ] Session 40 — M12 Students list + detail 12.4–12.7 (Sonnet)
- [ ] Session 41 — M12 audit + PR (Opus + skill — first FE feature with auth)
- [ ] Session 42 — M13 mockup gate (Sonnet, mockup-author)
- [ ] Session 43 — M13 Classes + enrollments work (Sonnet)
- [ ] Session 44 — M13 audit + PR (Sonnet + skill)
- [ ] Session 45 — M14 mockup gate (Sonnet, mockup-author)
- [ ] Session 46 — M14 Sessions work (Sonnet)
- [ ] Session 47 — M14 audit + PR (Sonnet + skill)
- [ ] Session 48 — M15 mockup gate — **highest stakes, budget 2–3 iterations** (Opus, mockup-author)
- [ ] Session 49 — M15 attendance core 15.1–15.4 (Sonnet)
- [ ] Session 50 — M15 keyboard + visitor 15.5–15.6 (Sonnet)
- [ ] Session 51 — M15 mid-milestone audit (Opus + skill)
- [ ] Session 52 — M15 IndexedDB queue 15.7 (Sonnet)
- [ ] Session 53 — **M15 final audit (full-codebase) + PR + `v0.9.0-rc` tag** (Opus + skill)

### Phase 4 — PWA + Dashboard + release (M16a–M16c → tag `v1.0.0`)

- [ ] Session 54 — M16a mockup gate (Sonnet, mockup-author)
- [ ] Session 55 — M16a Dashboard work (Sonnet)
- [ ] Session 56 — M16a audit + PR (Sonnet + skill)
- [ ] Session 57 — M16b PWA work (Sonnet)
- [ ] Session 58 — M16b audit + PR (Sonnet, no skill — PWA infra)
- [ ] Session 59 — M16c polish work (Opus)
- [ ] Session 60 — **M16c tag audit (full-codebase) + PR + `v1.0.0` tag** (Opus + skill)

**Current state**: Sessions 1 + 2 complete (2026-05-17) — `chore/m00-scaffold` pushed to origin. Sub-steps 0.1–0.6 all done: pnpm/turbo wiring, tsconfig + eslint-config skeletons, docker-compose dev+test Postgres, `docs/api/` (from seirin) + `docs/web/` (from mestre-kame, patched) + `docs/plan.md` + `RUNBOOK.md` + root `CLAUDE.md` + all six `.claude/agents/*.md`, CI workflow green on push (run 25991618871). PR not yet opened — that's Session 3.
**Next session**: Session 3 — M0 audit + PR (Sonnet, no skill).

---

## Prerequisite (one-time, outside Claude Code)

```powershell
cd C:\Users\franc\Documents\Projects
mkdir ckm
cd ckm
git init
```

Then open Claude Code with `ckm/` as the working directory. Every session below assumes you're
in `ckm/`.

---

## Phase 1 — Backend (M0 → M9)

### Session 1 — M0 scaffold infrastructure

**Model**: `/model opus`
**Branch (I create)**: `chore/m00-scaffold`
**Agent**: main agent (no specialist yet — they don't exist)

Paste:
> Starting M0, sub-steps 0.1 through 0.3. Plan is at
> `C:\Users\franc\.claude\plans\i-want-to-recreate-virtual-pillow.md`. Runbook is at
> `C:\Users\franc\.claude\plans\RUNBOOK.md`. Read the M0 block + the Git workflow section, then
> create the `chore/m00-scaffold` branch and execute 0.1, 0.2, 0.3 in order, verifying each.

End when: `pnpm install` succeeds, `pnpm turbo --help` works, both Postgres containers accept
connections. Mark Session 1 done in the runbook.

✂️ break

### Session 2 — M0 docs + CLAUDE.md + agents + CI

**Model**: `/model opus` (still Opus — doc merging needs judgment)
**Branch (continue)**: `chore/m00-scaffold`
**Agent**: main agent

Paste:
> Continuing M0 on `chore/m00-scaffold`. Execute sub-steps 0.4, 0.5, 0.6 from the plan. 0.4 is
> the doc copy + patch from `C:\Users\franc\Documents\Projects\seirin\docs-recreation\` and
> `C:\Users\franc\Documents\Projects\mestre-kame\docs-new-repo\`. 0.5 creates all six
> `.claude/agents/*.md` files (api-developer, web-developer, ux-design-keeper, ux-mockup-author,
> contracts-keeper, milestone-auditor) from the agent specs in the plan, AND copies both the plan
> and this RUNBOOK.md into `ckm/docs/plan.md` and `ckm/RUNBOOK.md`. 0.6 wires CI.

End when: all six agent files exist with valid frontmatter; both docs copied into `ckm/`; CI
workflow passes on a trivial push.

✂️ break

### Session 3 — M0 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `chore/m00-scaffold`
**Agent**: `milestone-auditor`

Paste:
> Run the `milestone-auditor` agent on M0. The `security-review` skill is skipped per the plan
> (M0 is surface-less). Write findings to `docs/audits/m00.md`. Then if clean, open the PR with
> `gh pr create` using the M0 template. After merge: `git checkout main && git pull`.

✂️ break (also do the merge between sessions)

### Session 4 — M1 contracts work

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m01-contracts`
**Agent**: main agent (foundational, no specialist needed)

Paste:
> Starting M1. Create branch `feat/m01-contracts`. Execute sub-steps 1.1 through 1.4 from the
> plan. All four sub-steps in one session — M1 is small.

End when: `pnpm --filter contracts test` and `pnpm --filter contracts build` both pass.

✂️ break

### Session 5 — M1 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m01-contracts`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M1 (security-review skill skipped, surface-less). Write to
> `docs/audits/m01.md`. Open the PR after.

✂️ break + merge

### Session 6 — M2 NestJS scaffold + config + common scaffolding

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m02-backend-foundation`
**Agent**: `api-developer`

Paste:
> Starting M2. Create branch `feat/m02-backend-foundation`. Use the `api-developer` agent.
> Execute sub-steps 2.1, 2.2, 2.3 in order, verifying each.

End when: `pnpm --filter api build` exits 0; common decorators + utils compile.

✂️ break

### Session 7 — M2 error handling + logger + Dockerfile

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m02-backend-foundation`
**Agent**: `api-developer`

Paste:
> Continuing M2 on `feat/m02-backend-foundation`. Execute sub-steps 2.4, 2.5, 2.6, 2.7.

End when: `nest start` logs structured JSON with redacted secrets; `docker build` succeeds.

✂️ break

### Session 8 — M2 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m02-backend-foundation`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M2, then the `security-review` skill (M2 has security surface —
> filters, validation pipe, password service, pino redaction). Write to `docs/audits/m02.md`.
> Open the PR if clean.

✂️ break + merge

### Session 9 — M3a Users data layer

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m03a-users-data-layer`
**Agent**: `api-developer`

Paste:
> Starting M3a. Create branch `feat/m03a-users-data-layer`. Use the `api-developer` agent.
> Execute sub-steps 3a.1 through 3a.6. Run `migration:run` against the dev DB before moving past
> 3a.1. The belt-rank CASE sort + LEFT JOIN exclusion pattern is the trickiest part — port from
> `seirin/src/users/users.service.ts` as reference.

End when: `users.e2e-spec.ts` passes against `postgres-test`.

✂️ break

### Session 10 — M3a audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m03a-users-data-layer`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M3a + `security-review` skill. Pay attention to soft-delete
> correctness (default queries hide deleted rows; `withDeleted: true` only after `softRemove`).
> Write to `docs/audits/m03a.md`. Open the PR.

✂️ break + merge

### Session 11 — M3b auth foundation (3b.1–3b.6)

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m03b-auth-request-layer`
**Agent**: `api-developer`

Paste:
> Starting M3b. Create branch `feat/m03b-auth-request-layer`. Use the `api-developer` agent.
> Execute sub-steps 3b.1 through 3b.6. **Stop after 3b.6** — there's a mandatory mid-milestone
> audit before 3b.7. Critical: no JWT secret fallback anywhere; family revocation must cover
> every row sharing `family_id` on replay.

End when: 3b.6 verified (unit test asserts consuming a refresh token twice revokes the entire
family).

✂️ break (security-critical break — do not skip the audit)

### Session 12 — M3b mid-milestone audit

**Model**: `/model opus` (auth = Opus for adversarial reasoning)
**Branch (continue)**: `feat/m03b-auth-request-layer`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` mid-milestone checkpoint for M3b. Scope is the diff to-date on
> `feat/m03b-auth-request-layer`. Focus per the plan: JWT secret fallback (must be absent),
> bcrypt comparison timing, rotation atomicity, family-revocation completeness, refresh-token
> bcrypt-hashed storage (never plaintext), throttler applied to login. Also run the
> `security-review` skill. Write to `docs/audits/m03b-checkpoint.md`. **Do not advance to 3b.7
> until findings are clean or explicitly accepted in `docs/audits/accepted-findings.md`.**

Triage findings. Fix blockers in additional commits on the same branch (use `api-developer` for
fixes, not the auditor — separation of concerns).

✂️ break

### Session 13 — M3b controller + e2e (3b.7)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m03b-auth-request-layer`
**Agent**: `api-developer`

Paste:
> Continuing M3b on `feat/m03b-auth-request-layer`. Mid-milestone audit is clean (verify
> `docs/audits/m03b-checkpoint.md` shows no open blockers). Execute sub-step 3b.7.

End when: `auth.e2e-spec.ts` passes (200 login, 401 bad creds with problem+json, 401 after
logout, family revocation on replay, 429 after rate limit).

✂️ break

### Session 14 — M3b final audit + PR

**Model**: `/model opus` (still security-sensitive)
**Branch (continue)**: `feat/m03b-auth-request-layer`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on the full M3b diff + `security-review` skill. Write to
> `docs/audits/m03b.md` (separate from the checkpoint file). Open the PR if clean.

✂️ break + merge

### Session 15 — M4 Students

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m04-students`
**Agent**: `api-developer`

Paste:
> Starting M4. Create branch `feat/m04-students`. Use the `api-developer` agent. Execute
> sub-steps 4.1 through 4.4. Teacher-isolation smoke test is required at 4.4 — cross-teacher
> access must return 404, never 403.

End when: `students.e2e-spec.ts` passes including the teacher-isolation smoke.

✂️ break

### Session 16 — M4 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m04-students`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M4 + `security-review` skill. Teacher-isolation is a release
> blocker — verify it explicitly. Belt-rank CASE expression: confirm no SQL injection vector.
> Write to `docs/audits/m04.md`. Open the PR.

✂️ break + merge

### Session 17 — M5 Classes + enrollments

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m05-classes-enrollments`
**Agent**: `api-developer`

Paste:
> Starting M5. Create branch `feat/m05-classes-enrollments`. Use the `api-developer` agent.
> Execute sub-steps 5.1 through 5.6. If context fills past 5.4, stop at the next sub-step
> boundary and ask me to open Session 17b.

End when: `classes.e2e-spec.ts` passes including enrollment dedupe + soft-delete + restore.

✂️ break (split into 17 + 17b if needed)

### Session 18 — M5 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m05-classes-enrollments`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M5 + `security-review` skill. Verify enroll/unenroll transaction
> rollback on partial failure; enroll idempotency. Write to `docs/audits/m05.md`. Open the PR.

✂️ break + merge

### Session 19 — M6 ClassSessions

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m06-class-sessions`
**Agent**: `api-developer`

Paste:
> Starting M6. Create branch `feat/m06-class-sessions`. Use the `api-developer` agent. Execute
> sub-steps 6.1 through 6.7. The partial unique index on `(class_id, date) WHERE deleted_at IS
> NULL` is the subtle part — verify it allows soft-deleted sessions to be re-created on the
> same date.

End when: `class-sessions.e2e-spec.ts` passes including 409 on duplicate + start/end transitions.

✂️ break

### Session 20 — M6 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m06-class-sessions`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M6 + `security-review` skill. Verify start/end state machine
> (can't end before start; can't start twice). Date-range queries: confirm no time-zone bugs
> (the spec uses date, not datetime). Write to `docs/audits/m06.md`. Open the PR.

✂️ break + merge

### Session 21 — M7 Attendances

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m07-attendances`
**Agent**: `api-developer`

Paste:
> Starting M7. Create branch `feat/m07-attendances`. Use the `api-developer` agent. Execute
> sub-steps 7.1 through 7.7. **Critical invariant**: `is_enrolled_class` is set at insert time
> and NEVER recomputed on read — this is an audit snapshot. Bulk create must be idempotent
> (re-running on a session returns existing rows untouched, even if enrollment changed after
> first insert).

End when: `attendances.e2e-spec.ts` passes including bulk idempotency + guest attendance
(is_enrolled_class=false) + every mark-* shortcut.

✂️ break

### Session 22 — M7 audit + PR

**Model**: `/model opus` (PII + audit-snapshot invariant = Opus)
**Branch (continue)**: `feat/m07-attendances`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M7 + `security-review` skill. Pay extra attention to: idempotency
> of bulk-create under concurrent requests, `is_enrolled_class` audit-snapshot invariant (verify
> a code-level guarantee, not just test coverage), teacher-isolation through session ownership,
> PII handling in attendance records and pino logs. Write to `docs/audits/m07.md`. Open the PR.

✂️ break + merge

### Session 23 — M8 Health + AppModule wiring + seeds

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m08-health-wiring-seeds`
**Agent**: `api-developer`

Paste:
> Starting M8. Create branch `feat/m08-health-wiring-seeds`. Use the `api-developer` agent.
> Execute sub-steps 8.1 through 8.6. 8.6 is a full manual smoke flow — run it end-to-end before
> declaring the milestone done. Seed admin credentials: registry `0001`, password defined in
> the seed file.

End when: the smoke flow (login → list students → create session → create attendance) returns
2xx at every step with no pino error logs.

✂️ break

### Session 24 — M8 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m08-health-wiring-seeds`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M8 + `security-review` skill. Verify: guard ordering Jwt → Roles →
> Throttler is correct (a public route should not require auth but should still be rate-limited);
> seeds refuse `NODE_ENV=production`; Swagger gated behind `SWAGGER_ENABLED` env flag (off in
> prod). Write to `docs/audits/m08.md`. Open the PR.

✂️ break + merge

### Session 25 — M9 e2e hardening 9.1–9.4

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m09-e2e-hardening`
**Agent**: `api-developer`

Paste:
> Starting M9. Create branch `feat/m09-e2e-hardening`. Use the `api-developer` agent. Execute
> sub-steps 9.1, 9.2, 9.3, 9.4. **9.3 is the teacher-isolation suite — it's a release blocker,
> don't shortcut it.** Every feature endpoint must be covered cross-teacher.

End when: all four sub-step verifications green.

✂️ break

### Session 26 — M9 problem-json + coverage + CI 9.5–9.7

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m09-e2e-hardening`
**Agent**: `api-developer`

Paste:
> Continuing M9 on `feat/m09-e2e-hardening`. Execute sub-steps 9.5, 9.6, 9.7. Coverage gate
> thresholds: lines 80, functions 80, branches 75, statements 80.

End when: CI runs e2e against the postgres service container and reports coverage ≥ thresholds.

✂️ break

### Session 27 — M9 **tag audit (full-codebase)** + PR + `v0.1.0-api-complete`

**Model**: `/model opus` (full-codebase audit at a release tag = Opus)
**Branch (continue)**: `feat/m09-e2e-hardening`
**Agent**: `milestone-auditor` (in full-codebase mode)

Paste:
> Run `milestone-auditor` in **full-codebase mode** (not just M9 diff) — this is the
> `v0.1.0-api-complete` release tag. Then run the `security-review` skill against the entire
> backend. Write M9-specific findings to `docs/audits/m09.md` AND full-codebase findings to
> `docs/audits/tag-v0.1.0-api-complete.md`. After both are clean: open the PR, merge it, then
> create the annotated tag:
>
> ```
> git tag -a v0.1.0-api-complete -m "Backend complete with full e2e + coverage gate"
> git push --tags
> ```

✂️ **Major checkpoint reached.** Project state: backend shippable. Next phase is FE.

---

## Phase 2 — Frontend foundation + design system (M10 → M11b)

### Session 28 — M10 contracts v1 + Vite scaffold (10.1–10.4)

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m10-fe-scaffold`
**Agent**: main agent (FE scaffolding is too foundational for `web-developer` specialist)

Paste:
> Starting M10. Create branch `feat/m10-fe-scaffold`. Execute sub-steps 10.1 through 10.4.
> 10.1 wires `pnpm openapi:generate` to emit types from the backend Swagger into
> `packages/contracts/src/api/`. 10.2–10.4 scaffold Vite + TanStack Router + TanStack Query +
> empty Tailwind v4 theme.

End when: `pnpm --filter web dev` boots at :5173; `packages/contracts/src/api/index.ts` exists
with non-empty generated types.

✂️ break

### Session 29 — M10 API client + auth + i18n + MSW (10.5–10.8)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m10-fe-scaffold`
**Agent**: `web-developer`

Paste:
> Continuing M10 on `feat/m10-fe-scaffold`. Use the `web-developer` agent. Execute sub-steps
> 10.5, 10.6, 10.7, 10.8. **Critical**: access token in memory only (never localStorage);
> refresh token in IndexedDB; 401 → /auth/refresh → retry once → on failure redirect to login.

End when: a smoke route `/__smoke` calls `/auth/me` against the running api and prints the JSON
when authed; MSW handlers intercept fetch in Vitest.

✂️ break

### Session 30 — M10 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m10-fe-scaffold`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M10 + `security-review` skill. Pay extra attention to token storage
> discipline: access token must NEVER touch localStorage; refresh token in IndexedDB only.
> Verify the 401 → refresh → retry loop can't infinitely recurse. Write to `docs/audits/m10.md`.
> Open the PR.

✂️ break + merge

### 🎨 Before Session 31 — Drop visual references

**You (the human)**, outside any session: create `docs/web/design-references/` and drop in any
inspiration images, palette pulls, type specimens, motion clips, app screenshots. Anything that
informs the visual direction. `ux-design-keeper` will read this directory at the start of every
M11a session.

Without references, Session 31 will produce a generic-looking system. Take this seriously.

### Session 31 — M11a spec: preamble + identity (11a.1–11a.2)

**Model**: `/model opus` (design judgment = Opus)
**Branch (I create)**: `feat/m11a-design-spec`
**Agent**: `ux-design-keeper`

Paste:
> Starting M11a. Create branch `feat/m11a-design-spec`. Use the `ux-design-keeper` agent.
> Execute sub-steps 11a.1 and 11a.2 from the plan. Read every file in
> `docs/web/design-references/` first, then write the preamble + identity section of
> `docs/web/design-system.md`. **Stop after 11a.2 for my approval before continuing.**

End when: identity section is reviewed and approved.

✂️ break

### Session 32 — M11a spec: scales + component playbook (11a.3–11a.4)

**Model**: `/model opus`
**Branch (continue)**: `feat/m11a-design-spec`
**Agent**: `ux-design-keeper`

Paste:
> Continuing M11a on `feat/m11a-design-spec`. Execute 11a.3 and 11a.4. **Stop after 11a.4 for
> my approval before continuing.**

End when: scales + component playbook reviewed and approved.

✂️ break

### Session 33 — M11a tokens.css + motion.ts (11a.5–11a.6)

**Model**: `/model sonnet` (execution, not design judgment)
**Branch (continue)**: `feat/m11a-design-spec`
**Agent**: `ux-design-keeper`

Paste:
> Continuing M11a on `feat/m11a-design-spec`. Execute 11a.5 and 11a.6 — translate the approved
> spec into `apps/web/src/styles/tokens.css` and `apps/web/src/styles/motion.ts`.

End when: `pnpm --filter web build` succeeds; a probe component using `bg-surface` renders the
correct color in both modes.

✂️ break

### Session 34 — M11a audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m11a-design-spec`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M11a (security-review skill skipped — markdown spec + CSS tokens
> have no security surface). Write to `docs/audits/m11a.md`. Open the PR.

✂️ break + merge

### Session 35 — M11b primitives wave 1 (11b.1–11b.4)

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m11b-primitives`
**Agent**: `ux-design-keeper` (still custodial, not feature dev)

Paste:
> Starting M11b. Create branch `feat/m11b-primitives`. Use the `ux-design-keeper` agent.
> Execute sub-steps 11b.1, 11b.2, 11b.3, 11b.4. Every primitive consumes tokens only — no raw
> Tailwind color utilities, no `bg-slate-*`. Each primitive appears on `/__design/`.

End when: Button, Input, Label, Card, Badge, Skeleton, StatusChip, EmptyState, Toast, Dialog,
Sheet all render on `/__design/` in every state.

✂️ break

### Session 36 — M11b layout + ESLint rule + `/__design/` (11b.5–11b.7)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m11b-primitives`
**Agent**: `ux-design-keeper`

Paste:
> Continuing M11b on `feat/m11b-primitives`. Execute 11b.5, 11b.6, 11b.7. The ESLint rule must
> trigger on a deliberate `bg-red-500` in a fixture file under `apps/web/src/features/`.

End when: `/__design/` gallery shows every primitive in every state; ESLint rule blocks raw
Tailwind colors in features.

✂️ break

### Session 37 — M11b audit + PR + `v0.2.0-design-system` tag

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m11b-primitives`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M11b + `security-review` skill. Verify: every primitive consumes
> tokens only; ESLint rule covers `apps/web/src/features/**`; primitives in `src/components/ui/`
> are exempt. Write to `docs/audits/m11b.md`. After clean: open PR, merge, tag:
>
> ```
> git tag -a v0.2.0-design-system -m "Design system tokens + primitives locked"
> git push --tags
> ```

✂️ **Design system complete.** Every feature in Phase 3 builds on this.

---

## Phase 3 — Feature surfaces (M12 → M15)

### Session 38 — M12 mockup gate

**Model**: `/model opus` (first FE feature mockup; design judgment)
**Branch (I create)**: `feat/m12-auth-students`
**Agent**: `ux-mockup-author`

Paste:
> Starting M12. Create branch `feat/m12-auth-students`. Use the `ux-mockup-author` agent.
> Execute the mockup gate (12.0): produce `/__mockups/auth/login`,
> `/__mockups/students/list-{loading,empty,loaded,error}`,
> `/__mockups/students/detail-{loaded,saving}`. Mobile (375×667) + desktop. Every state. End
> the session with a clear "Approve / Iterate" message listing every mockup URL.

Iterate until approved. Budget 2 cycles.

✂️ break

### Session 39 — M12 login + e2e (12.1–12.3)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m12-auth-students`
**Agent**: `web-developer`

Paste:
> Continuing M12 on `feat/m12-auth-students`. Mockup is approved. Use the `web-developer`
> agent. Reference the approved mockups under `apps/web/src/__mockups/auth/`. Execute sub-steps
> 12.1, 12.2, 12.3. Login is by registry (not email) — PT-BR field label "Registro".

End when: Playwright e2e `login → /auth/me → logout` passes on 375px viewport.

✂️ break

### Session 40 — M12 Students list + detail (12.4–12.7)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m12-auth-students`
**Agent**: `web-developer`

Paste:
> Continuing M12 on `feat/m12-auth-students`. Reference the approved mockups under
> `apps/web/src/__mockups/students/`. Execute sub-steps 12.4, 12.5, 12.6, 12.7. Inline 30-day
> attendance % thresholds: ≥80% success, 60-79% warning, <60% danger — via status tokens.

End when: students list + detail tabs work end-to-end against the running api; soft-delete with
undo toast works.

✂️ break

### Session 41 — M12 audit + PR

**Model**: `/model opus` (first FE feature with auth + token storage)
**Branch (continue)**: `feat/m12-auth-students`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M12 + `security-review` skill. First FE feature with real auth —
> verify token-storage discipline holds in practice (grep for `localStorage`; confirm only the
> i18n preference uses it, never tokens). XSS protection: confirm no `dangerouslySetInnerHTML`
> on user content; CSP set in index.html. Write to `docs/audits/m12.md`. Open the PR.

✂️ break + merge

### Session 42 — M13 mockup gate

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m13-classes`
**Agent**: `ux-mockup-author`

Paste:
> Starting M13. Create branch `feat/m13-classes`. Use the `ux-mockup-author` agent. Execute the
> mockup gate (13.0): produce `/__mockups/classes/list-{empty,loaded}`,
> `/__mockups/classes/new`, `/__mockups/classes/detail-{detalhes,alunos,aulas}`,
> `/__mockups/classes/enroll-dialog`. End with the Approve / Iterate message.

Iterate until approved. Budget 1–2 cycles.

✂️ break

### Session 43 — M13 Classes + enrollments work

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m13-classes`
**Agent**: `web-developer`

Paste:
> Continuing M13 on `feat/m13-classes`. Mockup approved. Use the `web-developer` agent.
> Reference the approved mockups. Execute sub-steps 13.1 through 13.5.

End when: enroll dialog uses `notEnrolledInClass` filter; enroll/unenroll round-trips work
optimistically.

✂️ break

### Session 44 — M13 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m13-classes`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M13 + `security-review` skill. Write to `docs/audits/m13.md`.
> Open the PR.

✂️ break + merge

### Session 45 — M14 mockup gate

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m14-sessions`
**Agent**: `ux-mockup-author`

Paste:
> Starting M14. Create branch `feat/m14-sessions`. Use the `ux-mockup-author` agent. Execute
> the mockup gate (14.0): produce `/__mockups/sessions/list`,
> `/__mockups/sessions/calendar-{month,week}`, `/__mockups/sessions/new`,
> `/__mockups/sessions/detail-{scheduled,in-progress,completed}`,
> `/__mockups/sessions/bulk-schedule`. End with the Approve / Iterate message.

Iterate until approved.

✂️ break

### Session 46 — M14 Sessions work

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m14-sessions`
**Agent**: `web-developer`

Paste:
> Continuing M14 on `feat/m14-sessions`. Mockup approved. Use the `web-developer` agent.
> Execute sub-steps 14.1 through 14.5. Calendar dots: color + icon + text, never color alone.

End when: month/week toggle works; start/end transitions round-trip; bulk-schedule-a-month
preview + confirm creates sessions atomically.

✂️ break

### Session 47 — M14 audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m14-sessions`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M14 + `security-review` skill. Verify bulk-schedule atomicity
> rollback path. Write to `docs/audits/m14.md`. Open the PR.

✂️ break + merge

### Session 48 — M15 mockup gate (HIGHEST STAKES)

**Model**: `/model opus` (the headline feature; design quality matters most here)
**Branch (I create)**: `feat/m15-attendance`
**Agent**: `ux-mockup-author`

Paste:
> Starting M15 — **the headline attendance flow**. Create branch `feat/m15-attendance`. Use the
> `ux-mockup-author` agent. Execute the mockup gate (15.0): produce
> `/__mockups/attendance/list-{pending,partial,complete}` on **375×667 mobile as primary**, plus
> desktop, plus every interaction state: `/__mockups/attendance/longpress-sheet`,
> `/__mockups/attendance/visitor-picker`, `/__mockups/attendance/bulk-confirm`,
> `/__mockups/attendance/offline-banner`. End with Approve / Iterate.

**Budget 2–3 iteration cycles.** Take the time — this gates the most expensive milestone.

✂️ break

### Session 49 — M15 attendance core (15.1–15.4)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m15-attendance`
**Agent**: `web-developer`

Paste:
> Continuing M15 on `feat/m15-attendance`. Mockup approved. Use the `web-developer` agent.
> Execute sub-steps 15.1, 15.2, 15.3, 15.4. Status badge tap = optimistic cycle with rollback
> toast on error; long-press (250ms) opens sheet. Mobile-first 375×667.

End when: tap cycles status optimistically; long-press opens sheet; "Todos presentes" bulk works.

✂️ break

### Session 50 — M15 keyboard + visitor (15.5–15.6)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m15-attendance`
**Agent**: `web-developer`

Paste:
> Continuing M15 on `feat/m15-attendance`. Execute sub-steps 15.5 and 15.6. **Stop after 15.6**
> — there's a mandatory mid-milestone audit before 15.7.

End when: visitor flow uses `notInSession` filter and creates with `is_enrolled_class=false`;
keyboard shortcuts (↑/↓ P L A E Enter / Esc) all work.

✂️ break

### Session 51 — M15 mid-milestone audit

**Model**: `/model opus`
**Branch (continue)**: `feat/m15-attendance`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` mid-milestone checkpoint for M15. Scope is the diff to-date. Focus
> per the plan: optimistic-update rollback correctness, race conditions in status cycling,
> bulk action idempotency, visitor-flow snapshot invariant (`is_enrolled_class=false`), missing
> TanStack Query invalidations, accessibility regressions in long-press + keyboard paths.
> Also run `security-review` skill. Write to `docs/audits/m15-checkpoint.md`. **Findings inform
> the conflict resolution strategy in 15.7 — read this file before 15.7 starts.**

Triage. Fix blockers via `web-developer`.

✂️ break

### Session 52 — M15 IndexedDB queue (15.7)

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m15-attendance`
**Agent**: `web-developer`

Paste:
> Continuing M15 on `feat/m15-attendance`. Mid-milestone audit findings in
> `docs/audits/m15-checkpoint.md` are clean. Execute sub-step 15.7. Conflict resolution =
> last-write-wins by server timestamp. Header sync badge shows queue depth.

End when: DevTools offline → mark → online → queue drains; Playwright e2e simulates the full
offline flow.

✂️ break

### Session 53 — M15 final audit (full-codebase) + PR + `v0.9.0-rc` tag

**Model**: `/model opus` (RC tag = full-codebase audit)
**Branch (continue)**: `feat/m15-attendance`
**Agent**: `milestone-auditor` (full-codebase mode)

Paste:
> Run `milestone-auditor` in **full-codebase mode** — this is `v0.9.0-rc`. Then run the
> `security-review` skill against the entire codebase (backend + frontend + contracts). Write
> M15-specific findings to `docs/audits/m15.md` AND full-codebase findings to
> `docs/audits/tag-v0.9.0-rc.md`. After both are clean and the M15 mid-milestone findings are
> all resolved or accepted: open the PR, merge, then tag:
>
> ```
> git tag -a v0.9.0-rc -m "Release candidate: attendance flow shipping"
> git push --tags
> ```

✂️ **Major checkpoint reached.** Attendance flow shippable.

---

## Phase 4 — PWA + Dashboard + release (M16a → M16c)

### Session 54 — M16a mockup gate

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m16a-dashboard`
**Agent**: `ux-mockup-author`

Paste:
> Starting M16a. Create branch `feat/m16a-dashboard`. Use the `ux-mockup-author` agent.
> Execute the mockup gate (16a.0): produce `/__mockups/dashboard/empty` (first-run, no data)
> and `/__mockups/dashboard/loaded` (today's sessions + KPI cards populated). End with Approve
> / Iterate.

Iterate until approved.

✂️ break

### Session 55 — M16a Dashboard work

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m16a-dashboard`
**Agent**: `web-developer`

Paste:
> Continuing M16a on `feat/m16a-dashboard`. Mockup approved. Use the `web-developer` agent.
> Execute sub-steps 16a.1 through 16a.4.

End when: dashboard renders with progress bars, quick actions, KPI cards updating reactively.

✂️ break

### Session 56 — M16a audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m16a-dashboard`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M16a + `security-review` skill. Write to `docs/audits/m16a.md`.
> Open the PR.

✂️ break + merge

### Session 57 — M16b PWA work

**Model**: `/model sonnet`
**Branch (I create)**: `feat/m16b-pwa`
**Agent**: `web-developer`

Paste:
> Starting M16b. Create branch `feat/m16b-pwa`. Use the `web-developer` agent. Execute
> sub-steps 16b.1 through 16b.4. No mockup gate — this is build infra, not a new visual
> surface (the sync badge slot was already in M11b's Header).

End when: Chrome shows install prompt; offline reload of `/students` renders cached shell.

✂️ break

### Session 58 — M16b audit + PR

**Model**: `/model sonnet`
**Branch (continue)**: `feat/m16b-pwa`
**Agent**: `milestone-auditor`

Paste:
> Run `milestone-auditor` on M16b. Security-review skill is **skipped** per the plan (PWA infra
> is surface-less). Write to `docs/audits/m16b.md`. Open the PR.

✂️ break + merge

### Session 59 — M16c polish + a11y + release prep

**Model**: `/model opus` (release polish = judgment work)
**Branch (I create)**: `feat/m16c-polish`
**Agent**: `web-developer` (with `ux-design-keeper` consulted for a11y review)

Paste:
> Starting M16c. Create branch `feat/m16c-polish`. Use the `web-developer` agent. Execute
> sub-steps 16c.1 through 16c.5. 16c.3 (a11y audit) requires axe-core in Playwright; 16c.4
> requires Lighthouse run with results saved to `docs/web/lighthouse-baseline.json`. 16c.5
> requires a working README.md following the smoke flow from the plan's Verification section.

End when: zero axe violations on `/`, `/students`, `/sessions/:id/attendance`, `/login`;
Lighthouse PWA installable, a11y ≥ 95, perf ≥ 90 on `/sessions/:id/attendance` at 375×667.

✂️ break

### Session 60 — M16c **tag audit (full-codebase)** + PR + `v1.0.0` tag

**Model**: `/model opus` (final pre-release audit = full-codebase Opus)
**Branch (continue)**: `feat/m16c-polish`
**Agent**: `milestone-auditor` (full-codebase mode)

Paste:
> Run `milestone-auditor` in **full-codebase mode** — this is the final `v1.0.0` release tag,
> the most thorough audit of the project. Then run the `security-review` skill against the
> entire codebase. Cross-reference against `docs/audits/accepted-findings.md` so accepted
> trade-offs aren't re-flagged. Write findings to `docs/audits/m16c.md` AND
> `docs/audits/tag-v1.0.0.md`. After clean and the README + Lighthouse + a11y gates pass: open
> the PR, merge, then tag:
>
> ```
> git tag -a v1.0.0 -m "v1.0.0 — CKM shippable"
> git push --tags
> ```

✂️ **Project complete.** v1.0.0 shipped.

---

## Quick reference

### Branches (11 total)

1. `chore/m00-scaffold`
2. `feat/m01-contracts`
3. `feat/m02-backend-foundation`
4. `feat/m03a-users-data-layer`
5. `feat/m03b-auth-request-layer`
6. `feat/m04-students`
7. `feat/m05-classes-enrollments`
8. `feat/m06-class-sessions`
9. `feat/m07-attendances`
10. `feat/m08-health-wiring-seeds`
11. `feat/m09-e2e-hardening`
12. `feat/m10-fe-scaffold`
13. `feat/m11a-design-spec`
14. `feat/m11b-primitives`
15. `feat/m12-auth-students`
16. `feat/m13-classes`
17. `feat/m14-sessions`
18. `feat/m15-attendance`
19. `feat/m16a-dashboard`
20. `feat/m16b-pwa`
21. `feat/m16c-polish`

(21 branches — one per milestone, including the splits.)

### Tags (4 total)

- `v0.1.0-api-complete` after Session 27 (M9)
- `v0.2.0-design-system` after Session 37 (M11b)
- `v0.9.0-rc` after Session 53 (M15)
- `v1.0.0` after Session 60 (M16c)

### Model split

- **Opus** sessions: 1, 2, 12, 14, 22, 27, 31, 32, 38, 41, 48, 51, 53, 59, 60 — about 15 sessions.
- **Sonnet** sessions: the remaining ~45.

### Agents used

- `api-developer` — sessions 6, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 26
- `web-developer` — sessions 29, 39, 40, 43, 46, 49, 50, 52, 55, 57, 59
- `ux-design-keeper` — sessions 31, 32, 33, 35, 36
- `ux-mockup-author` — sessions 38, 42, 45, 48, 54
- `milestone-auditor` — every audit session (about 20 sessions total)
- `contracts-keeper` — invoked ad-hoc when DTOs change between FE/BE (not scheduled here; runs
  inside other sessions when needed)

---

## Notes on staying flexible

This runbook is a strong default, not a contract. If you discover:

- A milestone is bigger than estimated → split a session, add `Session Nb`, mark it in the tracker.
- A milestone is smaller than estimated → combine, but keep the audit session separate.
- An audit finds blockers → don't open the PR; add fix sessions until clean.
- A mockup needs more than 3 iteration cycles → it usually means the design-system spec from
  M11a is missing a piece; escalate to `ux-design-keeper` to add a token/primitive, then iterate.
- You hit a cross-stack issue between sessions → spin a one-off Opus debugging session; don't
  try to debug in a Sonnet feature session.

Update this file whenever any of those happen. The runbook is the project memory.
