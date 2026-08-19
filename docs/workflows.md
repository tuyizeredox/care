# The workflow and handover system

This is the part of the platform that makes it more than a task list. This document explains
how a task travels, who decides where it goes next, and what gets recorded on the way.

---

## The model

A **workflow** is a named chain of **stages**. A task follows one workflow and sits at one
stage at a time. Each stage answers three questions:

| Question | Field |
| --- | --- |
| What kind of step is this? | `type` — `WORK`, `REVIEW`, `APPROVAL` or `FINAL` |
| Who should hold the task here? | `assigneeMode` plus its reference |
| What status does the task take on arrival? | `entryStatus` |

Plus two optional settings: `slaHours` (a turnaround target, used by the SLA breach
report) and `requiresApproval` (creates a formal `Approval` record when the task arrives).

### Assignee modes

| Mode | Resolves to |
| --- | --- |
| `SPECIFIC_USER` | A named person |
| `POSITION` | Whoever holds that position — preferring someone in the task's department |
| `ROLE` | Anyone with that role — again preferring the task's department |
| `DEPARTMENT_HEAD` | The head of the task's department |
| `PROJECT_MANAGER` | The manager of the task's project |
| `MANAGER_OF_PREVIOUS` | The line manager of whoever held it last |
| `TASK_CREATOR` | Whoever created the task |
| `UNASSIGNED` | Nobody — the person acting is asked to choose |

Resolution lives in `WorkflowEngineService.resolveStageAssignee()`. When a mode cannot
resolve to an active user it returns `null` rather than guessing, and the caller asks a
human to pick.

---

## Choosing a workflow

When a task is created without an explicit workflow, the engine scores every active
candidate and takes the highest:

| Match | Score |
| --- | --- |
| Project matches | +8 |
| Task type matches | +4 |
| Department matches | +2 |
| Marked as the global default | +1 |

So a workflow scoped to *this task type on this project* beats one scoped to the project,
which beats one scoped to the task type, which beats the department's, which beats the
global fallback.

---

## Seeded workflows

```
Programme report approval
  1. Draft report                  work      unassigned            72h
  2. Technical review              review    GESI Advisor          48h
  3. Project manager consolidation review    project manager       24h
  4. Programme Director approval   approval  Programme Director    48h
  5. Completed                     final

Procurement request
  1. Request raised                work      task creator          24h
  2. Procurement Officer           work      Procurement Officer   72h
  3. Procurement Specialist        review    Procurement Specialist 48h
  4. Operations Manager approval   approval  Operations Manager    48h
  5. Completed                     final

Payment approval
  1. Prepare payment               work      Finance Officer       48h
  2. Verification                  review    Finance & Accounting Supervisor 24h
  3. Finance Manager approval      approval  Finance Manager       24h
  4. Completed                     final

HR request · MEAL data verification · Simple task (global default)
```

None of these follows the org chart automatically — that is the point. Procurement goes
through Operations regardless of who raised it; a programme report goes through technical
review before it reaches a director.

---

## Handover

The central interaction. The current owner opens **Submit & hand over** and chooses:

- **Send to** — any active employee. The workflow's own suggestion is pre-selected and
  badged *Next in workflow*, so the common path is one click.
- **Action** — what the recipient is being asked to do: continue, submit, review or
  approve. This determines the status the task takes and the assignment role recorded.
- **Handover note** — free text, stored permanently on the tenure and shown in the
  journey.

### What happens on confirm

Inside one transaction:

1. The outgoing tenure is closed: `exitedAt` set, `durationSeconds` materialised.
   This happens whatever role the incoming holder takes, so a task never appears
   to be in two places at once.
2. A new tenure opens for the recipient, with the note, the stage and the next `sequence`.
3. The task row updates: `currentOwnerId`, `ownerSince`, `status`, `currentStageId`, and
   the `waitingForUserId` / `waitingReason` / `waitingSince` trio.
4. A `TASK_HANDED_OVER` history row is appended with both user ids and the note.
5. If the action was *approve*, a pending `Approval` record is created.

After the transaction: the recipient is notified, the task creator and previous assigner
are told the work moved on, and an audit-log entry is written.

`TasksService.moveOwnership()` is the only method in the codebase that changes task
ownership. Everything — assignment, submission, handover, approval routing, sending work
back — goes through it, which is why the ledger and the task row cannot disagree.

---

## Submission routing

`POST /api/tasks/:id/submit` works out the recipient in this order:

1. An explicitly named reviewer.
2. The next workflow stage's resolved assignee.
3. Whoever assigned the task.
4. Whoever created it.
5. The current owner's line manager.

If none of those resolves, the API refuses with *"There is nobody to send this task to.
Pick a reviewer before submitting."* rather than silently leaving the task stranded.

---

## Review decisions

| Decision | Effect |
| --- | --- |
| **Approve** | Advances to the next stage, or completes the task if this was the last one. Any pending approval by this user is marked approved. |
| **Request changes** | Returns the task to the last person who worked on it, status `CHANGES_REQUESTED`. **A reason is required.** |
| **Reject** | Same routing, recorded as a rejection. **A reason is required.** |

The reason requirement is enforced server-side, not only in the dialog:

```
"Please explain what needs to change so the task can move forward."
```

When a task is approved at its final stage it completes: the open tenure closes,
`completedAt` and `progress = 100` are set, the waiting state clears, a `TASK_COMPLETED`
history row is appended, and the creator, owner and watchers are notified.

---

## The journey

`GET /api/tasks/:id/journey` returns the timeline the task detail page renders.

- **Completed steps** come from the ownership ledger. They are facts: who held it, from
  when to when, for how long, with what note.
- **The current step** is the open tenure, marked `current` and visually emphasised.
- **Upcoming steps** are projected from the remaining workflow stages. They are clearly
  marked `upcoming` and drawn with dashed borders, because they are a prediction rather
  than a record.

The response also carries `totalElapsed`, `handoverCount`, per-holder timings, and
`slowestStage` — the stop that consumed the largest share of the total time.

---

## Bottleneck analysis

Everything in `AnalyticsService` derives from the same ledger:

| View | Question it answers |
| --- | --- |
| By stage | Which step in the process is slow, and how often does it breach its target? |
| By person | Where is work piling up? |
| By department | Which function is the constraint? |
| By workflow | What is the end-to-end cycle time, and how many handovers does it take? |
| Aging | How long has open work been outstanding? |

Open tenures are measured up to *now*, so a task sitting untouched shows up immediately
rather than only after it moves.

The framing is deliberate, in the API and the UI: a slow stage usually reflects unclear
handover rules, a capacity gap or a missing approval step. The analytics page says so
explicitly above the charts. This is process analysis, not individual performance
measurement.

---

## Guard rails

Two independent checks protect every move:

**The status machine** — `assertTransition(from, to)` refuses any edge the graph does not
contain, with a message safe to show a user:

> This workflow transition is not allowed (Draft cannot move to Completed).

**Permissions and ownership** — each transition rule carries an optional required
permission and an `ownerOnly` flag. `availableTransitions()` filters the graph for the
acting user, which is what the UI renders as buttons — so the interface never offers an
action the API would refuse.

Drag-and-drop on the Kanban board goes through the same endpoint. An invalid drop is
rejected by the API and reported as *"This move is not allowed"*, rather than being
allowed client-side and quietly diverging from the server.
