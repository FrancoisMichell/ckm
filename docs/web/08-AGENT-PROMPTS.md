# 08 — Agent Prompts

> **Superseded.** The mestre-kame draft of this file contained per-milestone Claude Code
> prompts targeting a backend + auth stack that does not apply to CKM.
>
> The live prompts (one per session, paste-verbatim) live in [`/RUNBOOK.md`](../../RUNBOOK.md)
> — see the "Sessions" headings. Each session names the model (`opus` or `sonnet`), the
> branch, the agent to delegate to, and the exact text to paste.
>
> The specialist agents themselves are defined in
> [`/.claude/agents/`](../../.claude/agents/):
>
> - `api-developer.md` — backend (NestJS + TypeORM + bcrypt + JWT Bearer)
> - `web-developer.md` — frontend feature work
> - `ux-design-keeper.md` — design system custodian
> - `ux-mockup-author.md` — feature mockup gate
> - `contracts-keeper.md` — cross-stack interface sync
> - `milestone-auditor.md` — per-milestone bug + security review
>
> The detailed reasoning behind each agent's scope is in
> [`/docs/plan.md`](../plan.md) under "Specialist agents".
