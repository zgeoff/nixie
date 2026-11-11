# The hold release after a restore

After a restore, each recovered task waits under a recovery hold until you release it. This doc
covers what you do from the first start of the restored nixie: read the recovery, release each task,
and start the backup job again. It also covers what the agent reads about the restore, the restore
runbook, and the drill that proves a restore.

Read 2 docs first. [Backup and recovery](backup-and-recovery.md) holds the restore and the recovery
hold, and defines recovery hold, recovery, hold release, restore marker, restore note, reader gate
and start part. [The publish numbers and the fetch](backup-publish-and-fetch.md) defines backup job,
backup set, publish, data snapshot, key snapshot and publish number.

The section "Built" gives what the code does. Every section after it gives the designed system. The
sketches in `sketches/operations/` hold the shapes and the notice's text, and this doc holds the
rules. A place marked `(open: <name>)` is not settled: see [the open list](open/operations.md),
which links the issue. Each open choice of this doc is yours to make. Other terms are in the
[glossary](../../glossary.md).

This doc adds one term. A **drill** is a rehearsal of a restore. It runs on a separate deployment
that no person uses.

## Built

- The API's task controls are pause, resume, stop, restart, close and interrupt. Each is a checked
  action that returns the task's state. The task control lib holds the rule of each control: which
  task states it takes and which state it gives.
- `tasks/list` and `tasks/read` return each task with its state.
- A host command of nixie calls a host procedure and prints the result, as `nixie sessions` does.
- `SystemMessageType` is the closed list of system message types. [Task messages](task-messages.md)
  holds the envelope that renders one.
- nixie stages a backup set on a clock from its first start, through `startBackupSchedule`. The
  backup job publishes each staged set, and each publish removes every key snapshot but its own.

## The hold release

[Place, install and hold release](sketches/operations/02-types.ts), section L, hold the shape.
[The hold release](sketches/operations/03-flow.ts), section H, holds the flow.

- `releaseRecoveryHolds` deletes each hold it is given and writes `recovery.hold_released` for each,
  in one transaction.
- A hold release changes nothing but the hold. The task is in the state its records give it, and the
  next claim takes it with whatever its inbox holds. A closed task remains closed.
- When the last recovery hold is released, the reader gate reopens in the same transaction.
- When nixie dies before a hold release commits, the hold remains. When nixie dies after the commit,
  the hold is gone, and nixie claims the waiting work as any other work.
- A notice from nixie can wait on a held task's thread, and so can a fire of a trigger. The hold
  release changes neither record. [Fires for a held task](trigger-core.md#fires-for-a-held-task)
  holds what a fire does for a held task and after its hold release.
- One call from the API or a command releases one task (open: release one or all).
  `releaseRecoveryHolds` also takes `'all'`, which the API and the commands never pass.

## The API and the host commands

[The API and the host commands](sketches/operations/02-types.ts), section N, hold the shapes.
[Read the recovery and release each task](sketches/operations/01-usage.ts), section B, shows the
calls.

- `recovery/read` is for a signed-in session. It returns when nixie was restored, when the backup
  was taken, and each held task.
- The case in which `recovery/read` returns `recovery: null` is not settled (open: recovery read
  null).
- `tasks/release` is a checked action that releases one task's recovery hold and returns the task's
  state. It refuses a task with no recovery hold with `TASK_NOT_HELD`.
- `tasks/release` is the 7th task control, named `release` (open: release control name). A hold
  release never reads or changes a task's state, so the task control lib has no rule for it.
- `resume` never clears a recovery hold. A held task is not always paused, and `resume` refuses a
  task that is not paused.
- `tasks/list` and `tasks/read` return each task with `isHeld`. A client that does not know the
  member ignores it.
- `nixie recovery` prints the result of `recovery/read` as JSON.
- `nixie task-release <task_id>` releases one task's recovery hold and prints the task's state.

## The restore notice

[The restore notice](sketches/operations/02-types.ts), section O, holds the shape and the text.

- The restore notice is one inbox record on the conversation's thread. The hold release of the
  conversation task writes it, in the same transaction (open: restore notice). Without the notice,
  the agent contradicts what you remember of the lost span.
- The record's system message type is `restore`, a member of `SystemMessageType`.
  [Task messages](task-messages.md) holds the envelope.
- nixie builds the notice's sentences from the record's payload. They give the time of the restore,
  the time of the backup, and the fact that the log holds nothing after the backup.
- The record does not wake the conversation. The agent reads it with your next message.
- When nixie dies before the hold release of the conversation commits, the hold remains and the
  notice is not written. After the commit, both the hold release and the notice are written.
- A restore holds the conversation unless the exempt tasks of the server app include it. When they
  do, the start part `recovery_holds` writes the restore notice in its transaction.

## The first publish after a restore

- A publish removes every key snapshot but its own, and nothing undoes that. The first publish after
  a restore replaces the key snapshot that the restore came from with a key copy of the restored
  nixie. So the backup job is stopped from the restore until you start it, and you start it only
  after you have read the recovery and released each task.
- nixie never stages a backup set while a task is under a recovery hold (open: first publish).
- How the backup schedule learns that a task is under a recovery hold is not designed (open:
  schedule hold read).

## The restore runbook

The runbook `restore.md`, in the runbooks folder, holds these steps for any deployment:

1. Stop nixie and its backup job.
2. Fetch the backup pair with `nixie-backup fetch`.
3. Restore it with `nixie restore`.
4. Start nixie.
5. Read the recovery with `nixie recovery`.
6. Release each task with `nixie task-release`.
7. Start the backup job again. At this step you approve the first publish.
8. Make a host key for the restored host.

The runbook also holds these notes:

- Restore only with a build that has the recovery hold and writes the restore note.
- When you release the task of a [task definition](task-definitions.md), a fire that was written
  before the backup and never read can start a task run.
- Run the fetch without `--data-snapshot` when `nixie-backup snapshots` shows the newest key
  snapshot with `publish: null`. A data snapshot that you name then can hold records whose keys the
  key copy lacks (open: named snapshot window).
- A build without the recovery hold refuses to start while a hold exists, and its refusal text
  misleads. When it refuses on the restore marker, its text tells you to run the restore again. When
  it refuses on the reader gate, its text points you at the copy of the database that it made before
  a migration. In both cases, start the build that has the recovery hold.
- The steps on one deployment's cluster belong in the delivery brief, outside this repo.

## What you approve

An agent that does a restore for you asks you before each of these, because nothing undoes it:

- the stop of the live nixie and its backup job;
- the `nixie restore --yes`;
- the first publish after a restore;
- each hold release;
- the creation of a drill's namespace and volume.

## The drill

- A drill nixie starts with backups off, with no backup job, and with no sandbox backend that it can
  reach.
- A drill nixie never shares a sandbox backend or a backup repository with a live nixie. The start
  part `recovery` destroys the sandboxes of steps that have ended, and one publish of a drill's
  backup set removes every other key snapshot, the live nixie's included.
- A drill never sends a turn. Its evidence is the recovery read, the held task list and the health
  report.
- The drill reads the repositories with a credential that cannot delete, where the backend offers
  one (open: drill credential).
- A drill restores onto a fresh Kubernetes volume from the data repository, the key repository, the
  deployment's own repo and the recovery key, and ends with the recovered tasks held.
- A drill needs 3 things from you: a cluster, the credentials of both repositories, and the recovery
  key.

## Not in scope

- A hold release of all tasks in one call from the API or a command.
- A hold release for the source of a trigger. A restore never holds one.
- A notice to any task but the conversation.
- The steps on one deployment's cluster. The drill's steps belong in the delivery brief.
