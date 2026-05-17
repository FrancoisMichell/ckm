<!--
Title format: `<conventional-commit>: M<NN> — <short headline>`
Example: `feat(api): M3a — Users data layer (CRUD + soft-delete + filters)`
-->

## Milestone

- Milestone: **M\<NN\>** (link to `docs/plan.md` block)
- Branch: `<branch-name>`
- Session(s) covered: see `RUNBOOK.md`

## Summary

<!-- 1–3 bullets on what shipped. The diff is for what; this section is for why. -->

-
-

## Sub-step verification

<!-- Tick each sub-step's verification result; paste the command and its outcome inline. -->

- [ ] X.1 — `<verify command>` → green
- [ ] X.2 — `<verify command>` → green
- [ ] X.N — `<verify command>` → green

## Audit

- [ ] `milestone-auditor` run → findings at `docs/audits/m<NN>.md`
- [ ] `security-review` skill run (skipped on M0, M1, M11a, M16b — note here if skipped and why)
- [ ] All blockers in the audit are resolved (or moved to `docs/audits/accepted-findings.md`)

## Mockup gate (FE feature milestones M12–M16a only)

- [ ] Mockups under `apps/web/src/__mockups/<feature>/` approved by user
- [ ] Mobile (375×667) + desktop screenshots attached below

## Breaking / migration notes

<!-- Cross-stack DTO changes? New env var? Migration that requires `migration:run`? Call it out. -->

## Screenshots / clips

<!-- Mobile first if FE. -->

## Checklist

- [ ] Conventional Commit title
- [ ] No `console.log` or commented-out code
- [ ] No tokens or PII in logs (pino redaction holds)
- [ ] No `localStorage` for access or refresh token
- [ ] No raw Tailwind color utilities in `apps/web/src/features/**`
- [ ] CI green
