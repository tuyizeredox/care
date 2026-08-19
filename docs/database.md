# Database architecture

PostgreSQL, accessed through Prisma. The schema lives in
[`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).

## Design principles

**The organisation is data.** Reporting lines live in `Position.reportsToId` (structural)
and `User.managerId` (effective). Nothing in the application hard-codes the hierarchy, so
administrators can reshape it at runtime.

**History is append-only.** `TaskHistory` rows are written, never updated or deleted. The
service that writes them exposes no mutation methods.

**Ownership is a ledger.** `TaskAssignment` records one row per tenure with a
materialised duration, so analytics never has to subtract dates across a whole table.

**Soft deletion where history matters.** `deletedAt` on users, departments, positions,
projects, tasks, workflows, comments and attachments. Hard deletes would orphan the
audit trail.

---

## Model reference

### Identity and access

| Model | Purpose |
| --- | --- |
| `User` | A person. Holds `roleId`, `departmentId`, `positionId`, `managerId`. `passwordHash` is never selected into a response. |
| `Role` | A named bundle of permissions with a seniority `level`. |
| `Permission` | One capability, keyed by a machine name such as `approve_task`. |
| `RolePermission` | Join table: which permissions a role grants. |
| `UserPermission` | Per-user override. `granted = false` explicitly revokes a permission the role would otherwise give. |
| `RefreshToken` | SHA-256 hash of an issued refresh token, with revocation and expiry. The raw token is never stored. |

Effective permissions resolve as: role permissions **+** user grants **−** user
revocations. `AccessControlService` is the only place this is computed.

### Organisation structure

| Model | Purpose |
| --- | --- |
| `OrganizationUnit` | Free-form structural tree: organisation → division → department → team. Drives the org chart. |
| `Department` | The functional department — the primary analytics dimension. Carries a colour used consistently across charts and badges. |
| `Position` | A job. `reportsToId` encodes the structural line; `level` orders seniority (100 = Country Director). |

### Projects

| Model | Purpose |
| --- | --- |
| `Project` | Groups related tasks. Has a manager, department, dates and status. |
| `ProjectMember` | Membership with a project role (manager, lead, member, viewer). |

### Workflows

| Model | Purpose |
| --- | --- |
| `TaskType` | A kind of work — programme report, procurement request, payment. |
| `TaskWorkflow` | A named route, optionally scoped to a task type, project or department. One can be the global default. |
| `WorkflowStage` | One stop on the route: its type, who holds the task there, the status it takes on entry, and an optional SLA in hours. |
| `WorkflowTransition` | The explicit stage graph. When absent, the engine falls back to linear order. |

`AssigneeMode` decides who receives a task entering a stage:
`SPECIFIC_USER`, `POSITION`, `ROLE`, `DEPARTMENT_HEAD`, `PROJECT_MANAGER`,
`MANAGER_OF_PREVIOUS`, `TASK_CREATOR`, `UNASSIGNED`.

### Tasks

| Model | Purpose |
| --- | --- |
| `Task` | The central record. Carries the current owner, department, project, workflow, current stage, deadline dates and denormalised "waiting for" state. |
| `TaskAssignment` | **The ownership ledger.** One row per tenure: `enteredAt`, `exitedAt`, `durationSeconds`, `sequence`, and the handover `note`. Exactly one possession row (OWNER, REVIEWER or APPROVER) is open at a time. |
| `TaskHistory` | **The immutable audit trail.** One row per significant action with actor, summary, before/after values and an optional comment. |
| `TaskComment` | Threaded discussion. `parentId` gives one level of replies. |
| `CommentMention` | Who was @mentioned, so they can be notified. |
| `TaskAttachment` | File metadata. `storageKey` is provider-specific and never exposed to the browser. |
| `Approval` | A formal decision request, with `sequence` for multi-step chains. |
| `Tag` / `TaskTag` | Free-form labelling. |
| `TaskWatcher` | Who follows a task and receives its activity notifications. |

#### Task denormalisation, and why

Three columns duplicate information available elsewhere, deliberately:

| Column | Why it exists |
| --- | --- |
| `ownerSince` | "How long has it been with this person" is on every list row. Computing it from the ledger would mean a join per row. |
| `waitingForUserId`, `waitingReason`, `waitingSince` | The "Waiting For" dashboards stay a single indexed query. |
| `subtaskCount`, `completedSubtaskCount` | Progress bars in list views without a sub-query per task. |

All three are written inside the same transaction as the change they describe, so they
cannot drift from the ledger.

### Notifications, audit and settings

| Model | Purpose |
| --- | --- |
| `Notification` | One in-app notification, with the email delivery outcome recorded on the row. |
| `NotificationPreference` | Per-user, per-type channel choices. |
| `AuditLog` | System-level trail: who did what to which resource, with before/after snapshots, IP and user agent. |
| `Setting` | Typed JSON configuration editable from the admin panel. |

---

## Indexing

Indexes follow the access patterns rather than being applied uniformly:

| Index | Serves |
| --- | --- |
| `Task(currentOwnerId, status)` | "My tasks", team workload |
| `Task(departmentId, status)` | Department dashboards |
| `Task(projectId, status)` | Project dashboards |
| `Task(deadline)` | Overdue and due-soon filters, the reminder sweep |
| `Task(waitingForUserId)` | "Waiting for" roll-ups |
| `TaskAssignment(taskId, sequence)` | Journey reconstruction in order |
| `TaskAssignment(userId, exitedAt)` | Per-person bottleneck aggregation |
| `TaskHistory(taskId, createdAt)` | Task history, newest first |
| `Notification(userId, readAt)` | Unread badge count |
| `AuditLog(actorId, createdAt)` | Admin log filtering |

---

## Status lifecycle

```
DRAFT ─────► ASSIGNED ─────► IN_PROGRESS ─────► SUBMITTED ─────► UNDER_REVIEW
                 ▲                 │                                   │
                 │                 └───── hand over for review ───────►│
                 │                                                     │
                 │                                                     ├──► APPROVED ──► COMPLETED
                 │                                                     │
                 └──────── CHANGES_REQUESTED ◄─────────────────────────┘

Any live status ──► BLOCKED ──► (back to where it was)
Any live status ──► CANCELLED
COMPLETED / CANCELLED ──► reopened, with the reopen_task permission
```

`IN_PROGRESS → UNDER_REVIEW` exists alongside `IN_PROGRESS → SUBMITTED`: submitting puts
work into a queue, whereas handing over for review passes it to a named person. Both are
gated — the first on `submit_task`, the second on `handover_task` — and both require
ownership.

The graph is defined once, in
[`task-status.machine.ts`](../apps/api/src/modules/tasks/task-status.machine.ts), and
every status change goes through `assertTransition()`.

---

## Migrations

```bash
npm run prisma:migrate     # create + apply in development
npm run prisma:deploy      # apply in production
npm run prisma:reset       # DESTRUCTIVE: drop, recreate, reseed
```

On pooled providers (Neon, Supabase, PgBouncer) Prisma Migrate needs a direct connection,
because a pooled session cannot hold the advisory lock it takes. Set `DIRECT_URL` to the
unpooled endpoint; the datasource block already reads it.
