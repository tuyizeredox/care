# CARE Workflow

**Workflow, task tracking and accountability for CARE**

This platform tracks work as it moves between people at CARE. It is built around two
questions that most task trackers answer badly:

> **Who has this task now?**
> **How did it get here?**

Every task has exactly one current owner and a complete, immutable record of everyone who
has held it, how long they held it for, and why they passed it on.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Development](#development)
- [Testing](#testing)
- [API](#api)
- [Roles and permissions](#roles-and-permissions)
- [The workflow engine](#the-workflow-engine)
- [Production deployment](#production-deployment)
- [Demo credentials](#demo-credentials)

---

## What it does

| Question | Where it is answered |
| --- | --- |
| What needs doing? | Personal dashboard, task list |
| Who is responsible now? | Current owner, shown on every task view |
| Who assigned it? | Task detail sidebar, history |
| Who is waiting for it? | "Waiting for" state on dashboards and lists |
| What stage is it in? | Status badge and workflow stage |
| Who previously handled it? | Task journey timeline |
| What has happened to it? | Immutable task history |
| What is overdue? | Deadline flags, overdue filters, reminders |
| What is blocked? | Blocked status with a required reason |
| Who needs to act next? | Handover routing, approval inbox |
| How long has it spent with each person? | Ownership ledger, bottleneck analytics |
| When was it completed? | Completion timestamp and journey end |

### Core capabilities

- **Task handover** — transfer a task to a named colleague with a note explaining what
  you are asking of them. The journey records the transfer permanently.
- **Workflow engine** — administrators define stage chains per task type, project or
  department. Different work follows different routes; nothing is hard-coded.
- **Guarded status transitions** — a task can only move along paths the state machine
  allows, and only by someone with the right permission.
- **Formal approvals** — multi-step approval chains. Rejection and change requests
  require a reason and return the task to the right person.
- **Immutable audit trail** — every significant action appends a `TaskHistory` row.
  Nothing is ever updated or deleted.
- **Bottleneck analytics** — derived from the ownership ledger: where work waits longest,
  by stage, person, department and workflow.
- **Reporting** — ten report types with CSV, Excel and PDF export.
- **Notifications** — in-app and email, per-user and per-event, with a daily deadline
  sweep for reminders and overdue escalation to line managers.

---

## Architecture

```
orgflow/
├── apps/
│   ├── api/                     NestJS REST API
│   │   ├── prisma/
│   │   │   ├── schema.prisma    PostgreSQL schema
│   │   │   ├── seed.ts          Seed orchestration
│   │   │   └── seed-data.ts     Organisation structure as data
│   │   ├── src/
│   │   │   ├── common/          Guards, filters, interceptors, DTOs, utilities
│   │   │   ├── config/          Typed configuration and env validation
│   │   │   ├── modules/         One folder per bounded context
│   │   │   └── main.ts
│   │   └── test/                End-to-end specs
│   └── web/                     Next.js App Router client
│       └── src/
│           ├── app/             Routes (auth group + authenticated group)
│           ├── components/      UI primitives and domain components
│           └── lib/             API client, auth context, formatting, types
├── docs/                        Architecture, API, database and workflow guides
└── docker-compose.yml           Local PostgreSQL
```

### Design decisions worth knowing

**The organisation is data, not code.** Departments, positions and reporting lines live
in the database. Administrators reshape the hierarchy at runtime and every visibility
rule follows automatically.

**One ownership ledger.** `TaskAssignment` holds one row per (task, holder) tenure with
`enteredAt`, `exitedAt` and a materialised `durationSeconds`. Exactly one possession row (owner, reviewer
or approver) is open per active task. This single table powers the journey timeline, the "time with
current owner" figure and the whole bottleneck engine — no date arithmetic across the
history table.

**History is append-only.** `TaskHistoryService` has `record()` and readers. There is
deliberately no update or delete. Every write takes an optional transaction client so
the event commits atomically with the change it describes.

**Ownership changes in one place.** `TasksService.moveOwnership()` is the only code that
changes who holds a task. It closes the outgoing tenure, opens the incoming one and
updates the denormalised columns in a single transaction, so the ledger and the task row
can never disagree.

**Errors never leak.** `AllExceptionsFilter` maps Prisma and internal failures to safe,
human-readable messages. Raw database errors and stack traces never reach a client.

---

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Radix UI primitives, Recharts, TanStack Query |
| Backend | NestJS 10, TypeScript, REST |
| Database | PostgreSQL 16, Prisma ORM |
| Auth | JWT access + rotating refresh tokens, bcrypt, role and permission guards |
| Storage | Pluggable: local disk, AWS S3, Cloudinary |
| Email | Nodemailer with reusable templates; logs to console when disabled |
| Testing | Jest (unit + e2e), Supertest |

---

## Getting started

### Prerequisites

- Node.js 20 or later
- PostgreSQL 16 (or Docker)

### Install

```bash
git clone <repository-url> orgflow
cd orgflow
npm install
```

### Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum `DATABASE_URL`, `JWT_SECRET` and `JWT_REFRESH_SECRET`.

> The Prisma CLI reads its own working directory, so `apps/api/.env` must carry the same
> `DATABASE_URL` (and `DIRECT_URL` if your provider separates pooled and direct
> connections, as Neon and Supabase do). Both files are gitignored.

### Start PostgreSQL (optional, for local development)

```bash
npm run db:up
```

### Create the schema and seed demo data

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### Run

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Web application | http://localhost:3000 |
| API | http://localhost:4000/api |
| API documentation (Swagger) | http://localhost:4000/api/docs |

Or in one step, from a clean checkout:

```bash
npm run setup && npm run dev
```

---

## Environment variables

All variables are documented in [`.env.example`](.env.example). The ones you must set:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `DIRECT_URL` | Unpooled connection, required by Prisma Migrate on pooled providers |
| `JWT_SECRET` | Access token signing key (32+ characters in production) |
| `JWT_REFRESH_SECRET` | Refresh token signing key — must differ from `JWT_SECRET` |
| `NEXT_PUBLIC_API_URL` | Where the browser reaches the API |
| `CORS_ORIGINS` | Comma-separated origins allowed to call the API |

Optional groups cover storage (`STORAGE_PROVIDER`, AWS, Cloudinary), email (`EMAIL_*`),
rate limiting and the reminder schedule.

Configuration is validated at boot by `src/config/env.validation.ts`, which refuses to
start production with placeholder or reused secrets.

---

## Database

Twenty-two models, normalised, with soft deletion wherever history matters. See
[`docs/database.md`](docs/database.md) for the full model reference.

```bash
npm run prisma:migrate     # create and apply a migration in development
npm run prisma:deploy      # apply pending migrations in production
npm run prisma:seed        # load the demo organisation
npm run prisma:studio      # browse the data
npm run prisma:reset       # DESTRUCTIVE: drop, recreate and reseed
```

---

## Development

```bash
npm run dev            # api + web together
npm run dev:api        # NestJS only, watch mode
npm run dev:web        # Next.js only
npm run typecheck      # both workspaces
npm run lint           # both workspaces
npm run build          # production build of both
```

---

## Testing

```bash
npm test               # unit tests
npm run test:e2e       # end-to-end tests (needs a migrated, seeded database)
```

**Unit tests** cover the status machine, deadline calculations, permission resolution and
data-visibility scoping, and the workflow engine's routing and assignee resolution.

**End-to-end tests** drive the whole documented journey against a live API and database:

```
create → assign → start → submit → handover → review
       → request changes → resume → resubmit → approve → complete
```

and assert the audit trail, the ownership ledger, notifications and visibility rules
along the way.

---

## API

REST, JSON, consistent envelopes.

```jsonc
// success
{ "success": true, "data": { }, "meta": { } }

// failure
{ "success": false, "error": { "code": "FORBIDDEN", "message": "…" },
  "path": "/api/tasks/1", "timestamp": "2026-08-19T10:00:00.000Z" }
```

Selected endpoints — the full reference is in [`docs/api.md`](docs/api.md), and Swagger
is served at `/api/docs` in development.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in, receive a token pair |
| `POST` | `/api/auth/refresh` | Rotate the refresh token |
| `GET` | `/api/tasks` | List with filters, search, sorting, pagination |
| `POST` | `/api/tasks` | Create |
| `GET` | `/api/tasks/:id` | Detail, including the full journey |
| `POST` | `/api/tasks/:id/assign` | Assign or reassign |
| `POST` | `/api/tasks/:id/submit` | Submit for review |
| `POST` | `/api/tasks/:id/handover` | **Hand over to a named colleague** |
| `POST` | `/api/tasks/:id/decision` | Approve, request changes or reject |
| `GET` | `/api/tasks/:id/journey` | Visual timeline |
| `GET` | `/api/tasks/:id/history` | Immutable audit trail |
| `GET` | `/api/dashboard` | Personal dashboard |
| `GET` | `/api/dashboard/team` | Manager dashboard |
| `GET` | `/api/dashboard/organization` | Executive dashboard |
| `GET` | `/api/analytics/overview` | Bottleneck analysis |
| `GET` | `/api/reports/export` | CSV / Excel / PDF export |

---

## Roles and permissions

Eight seeded roles, from `SUPER_ADMIN` down to `VIEWER`. Roles are a convenience: the
real check is always a permission.

```
effective permissions = role permissions + per-user grants − per-user revocations
```

Permissions include `create_task`, `assign_task`, `edit_task`, `delete_task`,
`submit_task`, `handover_task`, `review_task`, `approve_task`, `reject_task`,
`view_reports`, `manage_users`, `manage_organization`, `manage_workflows` and
`view_audit_logs`, among others. Administrators can reassign any of them.

Data visibility is separate from action permission: `view_all_tasks`,
`view_department_tasks` and `view_team_tasks` decide which tasks a query can even return,
and are applied inside the database query rather than after it.

---

## The workflow engine

A workflow is a named chain of stages. Each stage declares:

- what kind of stage it is — work, review, approval or final
- who holds the task there — a specific person, a position, a role, the department head,
  the project manager, the previous holder's line manager, or the task creator
- what status the task takes on entry
- an optional turnaround target in hours, used by the SLA breach reports

Seeded examples:

```
Procurement request
  Request raised → Procurement Officer → Procurement Specialist
                 → Operations Manager (approval) → Completed

Programme report approval
  Draft report → Technical review (GESI Advisor) → Project manager consolidation
               → Programme Director (approval) → Completed
```

Tasks pick the most specific matching workflow (task type + project beats project, which
beats task type, which beats department, which beats the global default) unless the
creator chooses one. See [`docs/workflows.md`](docs/workflows.md).

---

## Production deployment

1. **Build**

   ```bash
   npm ci
   npm run prisma:generate
   npm run build
   ```

2. **Migrate** — `npm run prisma:deploy` (never `prisma migrate dev` in production).

3. **Configure** — set `NODE_ENV=production` and real values for every secret. Boot fails
   fast if `JWT_SECRET` or `JWT_REFRESH_SECRET` is short, placeholder or duplicated.

4. **Run**

   ```bash
   npm run start:api    # node dist/main.js
   npm run start:web    # next start
   ```

5. **Behind a proxy** — terminate TLS at the proxy, set `CORS_ORIGINS` to your web
   origin, and point `NEXT_PUBLIC_API_URL` at the public API URL.

6. **Storage** — set `STORAGE_PROVIDER=s3` (or `cloudinary`) and install the matching
   SDK; the local provider is intended for development and single-node deployments.

Swagger is disabled automatically when `NODE_ENV=production`.

---

## Demo credentials

> **Development only.** The seed creates obviously fake accounts sharing one password.
> Change `SEED_DEFAULT_PASSWORD` or delete these accounts before any real deployment.

| Role | Email |
| --- | --- |
| Super administrator | `admin@care.demo` |
| Country Director | `country.director@care.demo` |
| Programme Director | `programme.director@care.demo` |
| SERVE Project Manager | `serve.pm@care.demo` |
| GESI Advisor | `gesi.advisor@care.demo` |
| Finance Manager | `finance.manager@care.demo` |
| Operations Manager | `operations.manager@care.demo` |
| Procurement Officer | `procurement.officer@care.demo` |

Password for every account: `Passw0rd!Demo`

The seed also creates 29 staff across six departments, five projects, six workflows and a
body of demo tasks that have genuinely travelled between people — including the worked
example from the specification (Programme Director → SERVE PM → GESI Advisor → back up
the chain), complete with its ownership ledger, history, comments and approvals.
