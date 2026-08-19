# API reference

Base URL: `http://localhost:4000/api`
Interactive documentation (development only): `http://localhost:4000/api/docs`

## Conventions

Every successful response is wrapped:

```jsonc
{ "success": true, "data": { /* payload */ } }
```

Paginated responses add `meta`:

```jsonc
{
  "success": true,
  "data": [ /* rows */ ],
  "meta": { "page": 1, "pageSize": 25, "total": 137, "totalPages": 6,
            "hasNextPage": true, "hasPreviousPage": false }
}
```

Failures never expose internals:

```jsonc
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "You do not have permission to perform this action." },
  "path": "/api/tasks/42/approve",
  "timestamp": "2026-08-19T10:00:00.000Z"
}
```

| Code | Status | Meaning |
| --- | --- | --- |
| `UNAUTHORIZED` | 401 | Missing, invalid or expired access token |
| `FORBIDDEN` | 403 | Authenticated, but not permitted |
| `NOT_FOUND` | 404 | No such record, or not visible to you |
| `BAD_REQUEST` | 400 | Validation failure; `details` lists the fields |
| `CONFLICT` | 409 | Unique constraint, e.g. a duplicate code |
| `UNPROCESSABLE_ENTITY` | 422 | Illegal workflow transition |
| `RATE_LIMITED` | 429 | Too many requests |

### Authentication

Send the access token as a bearer header:

```
Authorization: Bearer <accessToken>
```

Access tokens are short-lived (15 minutes by default). When one expires, exchange the
refresh token at `POST /api/auth/refresh`. Refresh tokens rotate: redeeming one revokes
it and issues a replacement, so a stolen token is single-use.

### Task identifiers

Endpoints under `/api/tasks/:id` accept either the cuid or the human task number, so
`/api/tasks/1042` and `/api/tasks/clx…` both work.

---

## Auth

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | public | Sign in. Returns `accessToken`, `refreshToken`, `user`. |
| `POST` | `/auth/refresh` | public | Rotate the token pair. |
| `POST` | `/auth/logout` | authenticated | Revoke the supplied refresh token, or all of them. |
| `GET` | `/auth/me` | authenticated | Current profile with effective permissions. |
| `POST` | `/auth/change-password` | authenticated | Change own password; revokes other sessions. |

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"serve.pm@care.demo","password":"Passw0rd!Demo"}'
```

---

## Tasks

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/tasks` | authenticated | List, filtered by what you may see |
| `POST` | `/tasks` | `create_task` | Create |
| `GET` | `/tasks/:id` | visibility | Detail with journey and available actions |
| `PATCH` | `/tasks/:id` | owner / supervisor / `edit_task` | Edit fields |
| `DELETE` | `/tasks/:id` | `delete_task` | Archive |
| `GET` | `/tasks/:id/history` | visibility | Immutable audit trail |
| `GET` | `/tasks/:id/journey` | visibility | Timeline: past, present, projected |
| `GET` | `/tasks/:id/timing` | visibility | Time spent with each holder |
| `GET` | `/tasks/:id/handover-candidates` | visibility | Who it can go to, with the workflow's suggestion |
| `POST` | `/tasks/:id/assign` | `assign_task` | Assign or reassign |
| `POST` | `/tasks/:id/start` | owner | Begin work |
| `POST` | `/tasks/:id/submit` | `submit_task` | Submit for review |
| `POST` | `/tasks/:id/handover` | `handover_task` | Hand over to a named colleague |
| `POST` | `/tasks/:id/review` | `review_task` | Take a submission under review |
| `POST` | `/tasks/:id/decision` | varies | Approve, request changes or reject |
| `PATCH` | `/tasks/:id/status` | varies | Guarded status change (used by the board) |
| `PATCH` | `/tasks/:id/waiting` | owner | Set what the task is waiting for |
| `POST` | `/tasks/:id/watchers` | visibility | Follow |

### Filtering

`GET /tasks` accepts, all combinable:

| Parameter | Notes |
| --- | --- |
| `status`, `priority`, `departmentId`, `projectId`, `ownerId`, `tags` | Repeatable or comma-separated |
| `createdById`, `workflowId`, `taskTypeId`, `waitingForUserId`, `waitingReason` | Single value |
| `deadlineFrom`, `deadlineTo`, `createdFrom`, `createdTo` | ISO dates |
| `overdue`, `dueToday`, `dueSoon` | Booleans |
| `assignedToMe`, `waitingOnOthers`, `needsMyAction`, `previouslyMine` | Booleans |
| `search` | Matches number, title, description, tags, comments, project, department and owner name |
| `sortBy`, `sortOrder`, `page`, `pageSize` | `sortBy` is restricted to an allow-list |

```bash
curl -G http://localhost:4000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'status=IN_PROGRESS,UNDER_REVIEW' \
  --data-urlencode 'overdue=true' \
  --data-urlencode 'sortBy=deadline' \
  --data-urlencode 'sortOrder=asc'
```

### Handover

```bash
curl -X POST http://localhost:4000/api/tasks/1042/handover \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "toUserId": "clx…",
        "action": "REVIEW",
        "note": "Report prepared and ready for GESI review."
      }'
```

`action` is one of `CONTINUE`, `SUBMIT`, `REVIEW`, `APPROVE`.

### Decision

```bash
curl -X POST http://localhost:4000/api/tasks/1042/decision \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
        "decision": "REQUEST_CHANGES",
        "comment": "Please correct the financial figures in section 3."
      }'
```

`comment` is mandatory for `REQUEST_CHANGES` and `REJECT`.

---

## Comments and attachments

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/tasks/:id/comments` | visibility |
| `POST` | `/tasks/:id/comments` | `comment_task` |
| `GET` | `/tasks/:id/mention-candidates` | visibility |
| `PATCH` | `/comments/:commentId` | author |
| `DELETE` | `/comments/:commentId` | author or admin |
| `GET` | `/tasks/:id/attachments` | visibility |
| `POST` | `/tasks/:id/attachments` | `upload_attachment` |
| `GET` | `/attachments/:id/download` | visibility |
| `DELETE` | `/attachments/:id` | uploader or `delete_attachment` |

Uploads are `multipart/form-data` with a `file` field. Both the extension and the MIME
type must match the same allow-list entry, and formats with a recognisable signature are
checked against their magic number. Downloads always stream through the authenticated
endpoint — storage keys are never exposed.

---

## Approvals

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/approvals` | authenticated |
| `GET` | `/approvals/pending-count` | authenticated |
| `POST` | `/tasks/:taskId/approvals` | `handover_task` |
| `POST` | `/approvals/:id/approve` | `approve_task` |
| `POST` | `/approvals/:id/reject` | `reject_task` |
| `POST` | `/approvals/:id/request-changes` | `review_task` |
| `POST` | `/approvals/:id/cancel` | requester |

Decisions are executed through the task engine, so an approval always moves the task,
writes history and fires notifications.

---

## Dashboards and analytics

| Method | Path | Permission | Returns |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | authenticated | Personal: buckets, performance, waiting-for |
| `GET` | `/dashboard/team` | `view_team_tasks` | Workload, overdue, bottlenecks |
| `GET` | `/dashboard/organization` | `view_analytics` | Totals, departments, trend, activity |
| `GET` | `/dashboard/departments/:id` | `view_analytics` | Department drill-down |
| `GET` | `/analytics/overview` | `view_analytics` | All bottleneck views at once |
| `GET` | `/analytics/bottlenecks/stages` | `view_analytics` | Per stage, with SLA breach rates |
| `GET` | `/analytics/aging` | `view_analytics` | Age buckets for open work |
| `GET` | `/analytics/tasks/:taskId` | `view_analytics` | Stage-by-stage breakdown for one task |

---

## Reports

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/reports` | `view_reports` |
| `GET` | `/reports/generate` | `view_reports` |
| `GET` | `/reports/export` | `export_reports` |

Report types: `task-completion`, `overdue`, `department-performance`, `employee-workload`,
`project-performance`, `workflow-performance`, `bottleneck`, `approval`, `task-aging`,
`monthly-activity`.

Export formats: `csv`, `excel`, `pdf`.

```bash
curl -G http://localhost:4000/api/reports/export \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'type=bottleneck' \
  --data-urlencode 'format=excel' \
  -o bottleneck.xlsx
```

CSV output is prefixed with a UTF-8 BOM so Excel opens it correctly, and any cell
beginning `=`, `+`, `-` or `@` is quoted to prevent formula injection.

---

## Organisation and administration

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/users`, `/users/directory`, `/users/:id` | visibility |
| `POST` | `/users` | `manage_users` |
| `PATCH` | `/users/:id`, `/users/:id/permissions` | `manage_users` |
| `POST` | `/users/:id/reset-password` | `manage_users` |
| `GET` | `/organization/chart`, `/organization/overview` | authenticated |
| `GET` | `/departments`, `/positions`, `/roles`, `/permissions` | authenticated |
| `POST`/`PATCH`/`DELETE` | `/departments`, `/positions` | `manage_organization` |
| `PATCH` | `/roles/:id` | `manage_roles` |
| `GET`/`POST`/`PATCH` | `/workflows` | `manage_workflows` |
| `GET`/`PUT` | `/settings` | `manage_settings` |
| `GET` | `/audit-logs`, `/audit-logs/actions` | `view_audit_logs` |
| `POST` | `/reminders/run` | `manage_settings` |

---

## Notifications and search

| Method | Path |
| --- | --- |
| `GET` | `/notifications` |
| `GET` | `/notifications/unread-count` |
| `GET`/`PATCH` | `/notifications/preferences` |
| `PATCH` | `/notifications/:id/read` |
| `POST` | `/notifications/read-all` |
| `GET` | `/search?q=…` |

Global search covers tasks, comments, projects, people and departments, and is filtered by
the caller's task visibility — it can never surface work someone may not see.

---

## Rate limiting

Global default: 300 requests per minute per IP. Sign-in is limited to 10 per minute and
refresh to 30, to slow credential stuffing. Both are configurable through
`RATE_LIMIT_*` environment variables.
