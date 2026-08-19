# Architecture

## Shape of the system

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js client (apps/web)                                  │
│  App Router · TanStack Query · Tailwind · Radix primitives  │
└───────────────────────────┬─────────────────────────────────┘
                            │  REST + JWT
┌───────────────────────────▼─────────────────────────────────┐
│  NestJS API (apps/api)                                      │
│                                                             │
│  Guards      JwtAuth → Roles → Permissions                  │
│  Pipes       ValidationPipe (whitelist, forbid unknown)     │
│  Interceptors Logging, response envelope                    │
│  Filter      AllExceptionsFilter (nothing raw escapes)      │
│                                                             │
│  Modules     auth · users · organization · departments ·    │
│              positions · projects · task-types · tags ·     │
│              workflows · tasks · comments · attachments ·   │
│              approvals · dashboard · analytics · reports ·  │
│              search · notifications · reminders · audit ·   │
│              settings · storage · mail                      │
└───────────────────────────┬─────────────────────────────────┘
                            │  Prisma
┌───────────────────────────▼─────────────────────────────────┐
│  PostgreSQL                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Request lifecycle

1. **ThrottlerGuard** — rate limiting, tighter on the auth routes.
2. **JwtAuthGuard** — verifies the access token, then *re-reads the user from the
   database*. Role changes and suspensions take effect immediately rather than at token
   expiry.
3. **RolesGuard** — checks `@RequireRoles()` where a route declares one.
4. **PermissionsGuard** — checks `@RequirePermissions()` against the caller's effective
   permissions.
5. **ValidationPipe** — DTO validation with `whitelist` and `forbidNonWhitelisted`, so
   unknown fields are rejected rather than silently ignored.
6. **Controller → Service** — controllers stay thin; all logic lives in services.
7. **TransformInterceptor** — wraps the result in the standard envelope.
8. **AllExceptionsFilter** — maps everything else to a safe error shape.

---

## Module boundaries

| Module | Owns |
| --- | --- |
| `auth` | Sign-in, token issue and rotation, password change |
| `users` | Accounts, profiles, per-user permission overrides, workload stats |
| `organization` | Org units, the chart, roles and permissions |
| `departments` / `positions` | The structural hierarchy |
| `projects` | Projects, membership, progress |
| `workflows` | Workflow CRUD **and** the routing engine |
| `tasks` | Tasks, the status machine, the ownership ledger, history, the journey |
| `comments` / `attachments` / `approvals` | Collaboration and formal decisions |
| `dashboard` / `analytics` / `reports` / `search` | Read-only projections |
| `notifications` / `mail` / `reminders` | Delivery |
| `audit` / `settings` / `storage` | Cross-cutting infrastructure |

Global modules — `prisma`, `common`, `audit`, `mail`, `storage`, `notifications`,
`settings`, `tags`, `workflows`, `tasks` — are exported once and injected anywhere,
rather than re-imported module by module.

---

## Where the important logic lives

| Concern | File |
| --- | --- |
| Status graph and permission gates | `modules/tasks/task-status.machine.ts` |
| Stage routing, assignee resolution | `modules/workflows/workflow-engine.service.ts` |
| Ownership ledger | `modules/tasks/task-assignment.service.ts` |
| Append-only history | `modules/tasks/task-history.service.ts` |
| Journey construction | `modules/tasks/task-journey.service.ts` |
| The single ownership mutation | `modules/tasks/tasks.service.ts` → `moveOwnership()` |
| Effective permissions, data visibility | `common/services/access-control.service.ts` |
| Safe error mapping | `common/filters/all-exceptions.filter.ts` |

---

## Authorization: two independent questions

**Can this user perform this action?** Answered by permissions. Roles are a convenience
bundle; the check is always against the effective permission set:

```
role permissions + per-user grants − per-user revocations
```

**Which records may this user see?** Answered by `buildTaskVisibilityFilter()`, which
returns a Prisma `where` fragment merged into the query itself. Filtering happens in the
database, never after fetching, so an unauthorised row is never loaded, counted or
paginated.

| Permission | Widens visibility to |
| --- | --- |
| `view_all_tasks` | Everything |
| `view_department_tasks` | The user's whole department |
| `view_team_tasks` | Every direct and indirect report (recursive CTE) |
| none | Tasks the user owns, created, assigned, watches, approves or previously held |

---

## Transaction boundaries

Anything that must not half-happen runs in one transaction:

- **Task creation** — task row, tags, watchers, opening tenure, `TASK_CREATED` and
  `TASK_ASSIGNED` history, parent subtask counter.
- **Ownership move** — close tenure, open tenure, update task, append history, create
  approval.
- **Approval** — decision record, tenure change or completion, history, counters.
- **Workflow edit** — stage deletes, order reshuffle, upserts, transition rebuild.

Notifications, emails and audit rows are written *outside* the transaction. They are
important but not part of the invariant, and a mail failure must not roll back a
handover.

A detail worth noting: reordering workflow stages first parks every existing `order` out
of the way (`+1000`) before applying the new numbering, so the unique
`(workflowId, order)` constraint is never violated mid-reshuffle.

---

## Frontend architecture

**Server components by default; client components where there is interactivity.** Pages
that read live data are client components using TanStack Query, which gives caching,
deduplication and coordinated invalidation after a mutation.

**One API client.** `lib/api-client.ts` owns the envelope, token storage, single-flight
refresh, and error translation. Nothing else calls `fetch`.

**Permissions drive the UI.** `useAuth().can()` hides actions the API would refuse, so
the interface never offers a button that fails. The API still enforces everything — the
client check is ergonomics, not security.

**Design tokens over ad-hoc colour.** Status and priority styling live in
`lib/constants.ts`, so a status badge looks identical in the table, the board, the
calendar and the timeline.

---

## Performance

- Every list endpoint paginates; nothing returns an unbounded set.
- Filtering, sorting and searching happen in PostgreSQL, not in Node.
- Indexes match the real access patterns (see [`database.md`](database.md)).
- `durationSeconds` is materialised when a tenure closes, so bottleneck analytics is a
  plain aggregate.
- Task rows carry denormalised `ownerSince`, waiting state and subtask counters, written
  in the same transaction as the change, so list views need no sub-queries.
- Dashboard aggregates batch through `Promise.all` rather than issuing serial queries.
- The client caches with a 30-second stale time and invalidates by key after mutations.

---

## Security

| Concern | Measure |
| --- | --- |
| Passwords | bcrypt, 12 rounds; a dummy hash is compared when an account does not exist so response time does not disclose registration |
| Sessions | Short-lived access tokens; refresh tokens stored as SHA-256 hashes and rotated on every use |
| Authorization | Global guards, permission-based, re-read per request |
| Data visibility | Enforced inside the query |
| Input | `class-validator` DTOs, unknown fields rejected |
| SQL injection | Prisma parameterises everything; the one raw query is a `Prisma.sql` template |
| Uploads | Extension + MIME + magic-number checks, size limit, generated storage keys, path-traversal guard |
| Downloads | Authenticated stream with `X-Content-Type-Options: nosniff` and forced attachment disposition |
| Rate limiting | Global, with tighter limits on sign-in and refresh |
| Headers | Helmet on the API; frame, sniff and referrer policies on the client |
| Secrets | Environment only, validated at boot, never returned in a response |
| Audit | Append-only `AuditLog` and `TaskHistory` |
| Export | CSV formula injection neutralised |

---

## Extension points

**A new storage backend** — implement `StorageProvider` (five methods) and add a case to
`StorageService`. Nothing else changes.

**A new notification channel** — `NotificationChannel` already includes `SMS` and
`WHATSAPP`. Add a renderer to the template catalogue and a delivery branch in
`NotificationsService.notify()`; every caller stays unchanged.

**A new report** — add an entry to `REPORT_TITLES` and a private method returning
`{ columns, rows, summary }`. All three export formats work immediately.

**A new workflow shape** — configuration, not code. Use the workflow builder.
