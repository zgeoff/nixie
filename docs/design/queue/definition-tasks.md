# The task of a definition

nixie binds one task to each task definition with `target: task`, and every task run of the
definition happens on that task. A definition therefore has one thread and one read cursor for as
long as it exists, and one sandbox while it is in force. This doc covers how nixie creates and binds
that task, what the task holds between task runs, and how the built code for tasks handles it.

The sketches in `sketches/definitions/` hold the type shapes and the texts of the refusals and
notices that have a text. This doc holds the rules. An item marked `(open: <name>)` is not settled,
and [the open list](open/definitions.md) holds it. The section "Built" describes the code as it is.
Every other section describes the design.

The [glossary](../../glossary.md) defines task, task run, inbox, lease, record, projection and
forget.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition, definition ID, definition hash,
  seed, in force and step.
- [Task runs of a definition](definition-task-runs.md) defines fire, pending task run and open task
  run.
- [Schedules](schedules-and-triggers.md) defines one-shot and spent one-shot.

Terms this doc adds:

- **Definition's task.** The task that nixie creates for a task definition with `target: task`.
- **Binding.** The link from a definition ID to its definition's task.
- **Hash in force.** The definition hash that the binding holds. It is null while the definition is
  out of force.
- **Out of force.** A definition is out of force when its folder is absent from the repo, when the
  definition holds `enabled: false`, or when the definition is a spent one-shot.
- **Started task.** A task that a `task.start` call created. Its row holds a starter, the task that
  called `task.start`.
- **Session boundary.** The point in a task's model session up to which nixie has committed.
- **Erasable field.** A part of a record that nixie encrypts under a key it can destroy.

## Built

This section lists the built code that the design uses or alters.

- The `task.created` record of a started task holds the task's options. The task ID is a short ID
  from `createShortID`.
- `claimTask` claims a task for one of 2 pools. It splits the pools on `tasks.started_by`: the
  `started` pool takes tasks with a starter.
- `reviveHeldTasks` and `readStartedTaskIDs` select the tasks whose `started_by` is not null.
- `pickNextState` picks a task's state when a step commits. A task in the state `done` gets no
  further step.
- `writeTaskLimitPause` sends the limit notice to the task's starter.
- `readTaskSetup` returns the setup of a started task.
- `readTurnContext` builds a start note as the first input of a started task.
- `readTaskDirectory` returns the task directory: the tasks that `task.message` can address.
- nixie sets a task to `failed` after `maxStepErrors` failed steps in a row. The default is 3.
- `runUnknownTaskStep` is the step of the pool for tasks without a starter. It rejects a task that
  is not one of the built-in tasks.

## One task per definition

The record shapes are in
[the binding record and the task's `task.created`](sketches/definitions/02-types.ts), section E. The
columns and the functions are in
[the tasks projection and the tasks module](sketches/definitions/02-types.ts), section F.

- A definition with `target: task` has one definition's task. All task runs of the definition happen
  on it.
- A definition with `target: conversation` has no task.
- nixie creates the task at the first seed that holds the definition in force, inside that seed's
  transaction.
- The task's `task.created` record holds the task ID, `isConversation: false` and the state
  `waiting`. It holds no starter, no options and no brief.
- The task ID is a short ID from `createShortID`.
- `task.definition_set` is the one record that binds a definition ID to a task. It is also the one
  record that holds the hash in force of that task.
- `task.definition_set` sits on the task's own thread. It does not wake the task, and it has no
  erasable field.
- `writeDefinitionBindingInTransaction` is the one function that writes `task.definition_set`.
- The `tasks` projection holds the columns `definition_id` and `definition_hash`. Both are nullable.
  Only `task.definition_set` sets them.
- A unique index covers `definition_id` where it is not null. A write of a second task for one
  definition fails the index, and its transaction fails.
- nixie sets `definition_id` once and never clears it. A binding never moves to another task.
- A rebuild of the projections from the log produces the same `tasks` rows.

## The seed hook

The comparison as code is in [the seed flow](sketches/definitions/03-flow.ts), section A.

- `writeDefinitionTasksInTransaction` is the seed hook of the tasks module.
- `runSeed` and `runInForceSeed` call the hook inside the seed's transaction.
- The seed calls the hook after all its checks have passed. A seed that nixie refuses does not call
  it.
- The seed calls this hook before the hook that arms each trigger, which
  [the trigger core](trigger-core.md) covers. The seed calls both before it can return `unchanged`.
- The seed passes the hook one list: the ID and the hash of each definition in force with
  `target: task`. A definition is in the list with or without a trigger.
- The hook compares the list with the `tasks` rows whose `definition_id` is set. For each definition
  in the list, and for each row that holds a hash, it does one of 4 things:

1. **In the list, and no row.** The hook writes `task.created` and `task.definition_set`.
2. **In the list, and the row holds another hash or a null hash.** The hook writes
   `task.definition_set` with the hash of the list.
3. **In the list, and the row holds the same hash.** The hook writes no record.
4. **Not in the list, and the row holds a hash.** The hook writes `task.definition_set` with a null
   hash.

- The hook returns 3 counts: tasks created, hashes set and hashes set to null.
- The definitions module calls the hook with the context of the tasks module. How the definitions
  module gets that context is not written (open: hook context).

## A bind of a task that exists

The refusals as code are in [the binding writer](sketches/definitions/03-flow.ts), section A.

- Code other than the seed hook can bind a definition ID to a task that exists. A migration step
  that moves a built task onto a definition is the one expected caller. This design does not include
  that step.
- That caller calls `writeDefinitionBindingInTransaction` with a null hash, before the first seed
  that holds the definition.
- `writeDefinitionBindingInTransaction` refuses the bind in 6 cases:

1. The task does not exist.
2. The task is the conversation.
3. The task has a starter.
4. The task's state is not `waiting`, or the task has unread input.
5. The definition is bound to another task.
6. The task is bound to another definition.

- The next seed finds the row of the bound task. It sets the hash by case 2 of the hook, and it
  creates no second task.

## Between task runs

- Between task runs the task holds 6 things: the binding, the thread, the read cursor, the session
  boundary, each message that did not wake it, and its sandbox.
- Between task runs the task holds no timer, no options and no count toward a limit.
- While a definition is in force, the sandbox of its task sleeps between task runs. A sleeping
  sandbox uses no host memory. If nixie destroyed the sandbox, every task run would wait for a
  sandbox start.
- The states of a definition's task are `waiting`, `ready`, `running`, `paused`, `stopped` and
  `failed`. nixie never sets the task to `done` or `closed`.

## A definition out of force

- At the seed that finds a definition out of force, the hook writes `task.definition_set` with a
  null hash, by case 4. The write is part of the seed's one transaction.
- After that commit, a fire does not open a task run on the task. A message does not open one
  either.
- A task run that is pending or open at that commit runs to its end. It uses the version and the
  limits that it pinned. [Decision 0013](../../decisions/0013-definition-versioning.md) records this
  rule.
- You end such a task run sooner with the stop control. The seed itself stops no task run.
- When the definition is in force again under the same ID, the hook writes the hash on the same row.
  The task, the thread and the read cursor are the ones from before.
- A message that is unread in the task's inbox is unread until the next task run. A task with
  `wakeable: true` reads it in that task run.
- When you close a definition's task, nixie refuses with the reason `definition_task_never_closes`.
  To end a definition, you disable it or delete its folder.

## How the built task code handles a definition's task

Each entry in full is in [the paths of a started task](sketches/definitions/03-flow.ts), section D.

- **The claim pools.** The `started` pool of `claimTask` takes a task with a starter or with
  `definition_id` set. The nixie runner serves that pool. The other pool takes neither.
- **The revival sweep.** `reviveHeldTasks` selects only tasks with a starter. It does not revive a
  definition's task.
- **The commit.** For a task with `definition_id` set, `pickNextState` returns `waiting` where it
  returns `done` for a started task. The task can therefore run again.
- **The controls.** Pause, resume, stop, restart and interrupt act as they do on a started task. Of
  these, only a restart can open a task run.
- **The setup.** `readTaskSetup` returns a `definition` member for a task with `definition_id` set.
  [The task runner port](task-runner-port.md) owns the function.
- **The runner.** The nixie runner reads the task's options through `readDefinitionVersion`, with
  the hash that the open task run pinned. It reads the report mode and the limits from the record
  `task.run_opened`.
- **The session.** Under `context: fresh`, the step that opened the task run gets a null session
  boundary, and so does a rerun of that step. Under `context: continuing`, every step resumes at
  `tasks.session_boundary`.
- **The first input.** `readTurnContext` builds no start note for a definition's task. The first
  input of a task run is the `trigger.fired` record or the message that opened it.
  [The task brief](task-brief.md) owns the order of the blocks.
- **The task directory.** `readTaskDirectory` returns a definition's task only while its hash in
  force is not null. `task.message` therefore cannot address a task whose definition is out of
  force.
- **The task list.** `tasks.list` and the dashboard show one row for each definition's task whose
  hash in force is not null. The row holds the name, the brief and the model of the version in
  force. Whether the task is wakeable is the version's `wakeable`: [waking a task](task-wake.md).
- **The task list, definition out of force.** `tasks.list` and the dashboard also show the task
  while one of its task runs is pending or open. The row holds the name of the version that the task
  run pinned. You reach the stop control from that row.
- **The limit notice.** `writeTaskLimitPause` sends the notice to the report target that the open
  task run pinned. When that target is null, it sends no notice.
- **The open tasks.** `readStartedTaskIDs` returns a definition's task in 2 cases: its hash in force
  is not null, or one of its task runs is pending or open. Recovery does not destroy the sandboxes
  of the returned tasks. The runner destroys the sandbox of a definition's task that is not
  returned.
- **A forget.** When you forget a record, nixie cleans up the model sessions that hold it. That
  cleanup covers every task that `readDefinitionTaskIDs` returns.

## The 2 readers that the tasks module takes

The shapes are in [the 2 readers](sketches/definitions/02-types.ts), section F.

- The server app passes `readDefinitionVersion` and `readDefinitionRunPolicy` from the definitions
  module into the context of the tasks module. Both are required.
- The tasks module therefore imports neither the definitions module nor the triggers module.
- `readDefinitionRunPolicy` takes the pinned hash beside the task ID. The version of a fire can go
  out of force before a claim opens its task run.
- `readDefinitionRunPolicy` returns the report mode that the definition declares, or null.
  [Task runs and reports](task-runs-and-reports.md) owns the default report mode and the report
  target.
- The time at which a definition was first enabled is the time of the first `task.definition_set`
  record of its task that holds a hash (open: first enabled time).

## When nixie dies during a seed

- When nixie dies before the seed's commit, it has written no task and no record. The next seed
  writes both.
- When nixie dies after the seed's commit, the row holds the binding. The next seed's hook finds
  case 3 and writes no record.

## Not in scope

- A migration step that binds a built task.
  [The delete of the built-in memory tasks](memory-task-delete.md) covers the note-taker and the
  consolidator.
- A stop of a task run by the seed.
- The enforcement of `maxCalls`, which [task run limits](task-run-limits.md) covers.
