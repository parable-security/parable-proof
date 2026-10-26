@AGENTS.md

# Parable Proof (V0)

## What this product does
A web app that checks whether the AI applications visible in a company's Microsoft 365 environment comply with that company's approved AI-use policy. First customer type: RIAs (registered investment advisors).

The full product spec is `docs/v0-user-journey.md`. Read it before building any screen. If the spec and this file disagree, ask before writing code.

## V0 flow (the definition of done)
Create review → Parable staff convert the AI policy into rules → customer CCO approves rules → upload Microsoft evidence CSV → validate → run checks → see results → open the evidence behind a finding → resolve findings → export a compliance report (PDF).

## Domain rules
- Exactly 4 checks: prohibited app, unknown AI app, unauthorized user, prohibited permission.
- Exactly 3 result states: COMPLIANT, POLICY EXCEPTION, REVIEW REQUIRED. Do not add others.
- Policy rules are entered by humans. There is no LLM anywhere in V0.

## Decisions already made (do not change without asking)
- Policy rules store the Microsoft `app_id`, not only the app name. Match on `app_id`; name matching is a fallback that produces REVIEW REQUIRED.
- Two roles: `parable_staff` (converts policy into rules) and `customer` (approves, uploads, resolves).
- A new evidence upload creates a new review. Finalized reviews and reports are frozen and never edited.
- A CONDITIONAL app with a permission that is neither allowed nor prohibited is REVIEW REQUIRED.
- Summary counts count apps, not rows. An app is an exception if any of its rows is.
- If the optional department column is missing, the unauthorized-user check does not run.

## Stack
Next.js (App Router, TypeScript strict), Tailwind, Supabase (Postgres, Auth, Storage), Drizzle ORM, deployed on Vercel.

## Code layout
- `src/app/` screens and routes
- `src/lib/engine/` the rule engine: pure functions only
- `src/lib/validation/` CSV validation
- `src/lib/db/` Drizzle schema and queries
- `fixtures/` sample and test-tenant data only
- `drizzle/` generated migrations (committed)

## Hard rules
- Never read, print, or edit `.env*` files. Ask the user if a value is needed.
- Nothing secret may use the `NEXT_PUBLIC_` prefix. The Supabase secret key and database URLs are server-only.
- `src/lib/engine/` must not import the database, network, UI, dates from the system clock, or randomness. Same input must always give the same result.
- Every database query is scoped to the current company. Never return another company's rows.
- Keep Row Level Security enabled on every table.
- Never put real customer data in `fixtures/` or in tests.
- Validate all user input (forms, CSV uploads) with Zod on the server.

## How to work
- One task at a time. Keep diffs small and explain what you changed.
- Ask before installing a new dependency.
- Ask before any command that changes the database (`drizzle-kit push`, `migrate`, or SQL that drops or alters tables).
- Do not commit or push. The user reviews and commits.
- After changes, run `npm run lint` and `npx tsc --noEmit` and fix errors.
- Write unit tests for every function in `src/lib/engine/` and `src/lib/validation/`.