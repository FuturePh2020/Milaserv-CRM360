# CLAUDE.md

Guidance for AI coding agents working in this repository.

## What this project is

Milaserv CRM360 — a telesales leads distributor: session/break tracking, Cash
and Insurance lead imports, atomic lead assignment, call dispositions, Yeastar
CDR call matching, and Admin/Agent dashboards. Source of truth for product
behavior is `docs/specifications/MILASERV_CRM360_MVP.md`. Do not contradict it
without calling that out explicitly.

This project is standalone. Never import from, depend on, or reference any
prior "Milaserv 360" repository.

## Non-negotiable rules (carried over from the spec)

1. All role/ownership/scope checks are enforced in the **backend**. The
   frontend hiding a button is never sufficient.
2. Lead assignment (`Generate Lead`, `Take Lead`) must be atomic and
   concurrency-safe — use a DB transaction with row locking
   (`SELECT ... FOR UPDATE SKIP LOCKED` or an equivalent conditional update).
   Never rely on frontend state or the 15-second refresh as a lock.
3. **Architecture change, superseding the original spec's Windows-companion
   design**: idle/activity detection is now browser-based, not a device-wide
   Windows companion. A browser tab genuinely cannot see activity outside
   itself — this is a real, accepted product limitation (an Agent idle in
   another application with the CRM360 tab merely open in the background
   reads as idle), not something to paper over. Track it honestly:
   `docs/architecture/ARCHITECTURE.md` documents the limitation explicitly,
   and the UI must never imply device-wide coverage it doesn't have. Admin
   controls the global inactivity threshold and can enable/disable tracking
   per Agent. There is no `apps/activity-agent` in this codebase anymore —
   do not reintroduce a Windows-companion path without an equally explicit,
   called-out architecture decision to revert this one.
4. Preserve raw imported values alongside normalized values. Never treat long
   identifiers (claim IDs, invoice numbers, national IDs, UPC codes) as
   numbers — always strings.
5. Never expose medication/pricing/insurance-financial data in general Agent
   Leads Search results — check the actual API response, not just the UI.
6. Import date formats must be explicitly selected, never guessed.
7. Every import, assignment, reassignment, Take Lead, disposition, session,
   break, and CDR match must be auditable (`AuditLog` / `LeadStatusHistory`).
8. Use Prisma migrations. Never hand-edit the database schema.
9. A working agent with zero breaks is `WORKED_NO_BREAK`, never `VACATION`.

## Repository conventions

- pnpm workspace; packages use `workspace:*` internal deps.
- Prisma schema lives only in `packages/database/prisma/schema.prisma`.
  Always run migrations through `pnpm prisma:migrate` from that package
  (it loads the root `.env` via `dotenv-cli`).
- Shared enums/constants that both `apps/web` and `apps/api` need go in
  `packages/contracts` — keep it dependency-free (no Prisma import) so the
  Next.js app never pulls in server-only code.
- Phone/date/price parsing lives in `packages/validation` and is unit tested
  directly against the sample files in `docs/samples/`. Add a test there
  before changing parsing behavior.
- NestJS: every route is authenticated by default (`JwtAuthGuard` is a global
  `APP_GUARD`). Mark an endpoint `@Public()` deliberately, and only for
  genuinely public routes (login, refresh, health).
- Use `@Roles(...)` from `common/decorators/roles.decorator.ts` for RBAC and
  `TeamScopeGuard` / service-level scope filtering for Shift Supervisor scope.

## Working style expected of an agent here

- Build in reviewable phases (see `docs/specifications/PHASE_PROMPTS.md` for
  the phase breakdown). After each phase: run typecheck/lint/test/build, show
  what changed, and update `docs/implementation/IMPLEMENTATION_STATUS.md`
  honestly — do not mark something done if tests or build are failing.
- Prefer extending existing modules over introducing parallel patterns.
