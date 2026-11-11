# The trigger core

Every trigger source hands its fires to one piece of code, the trigger core. For each fire, the
trigger core takes the fire at most once, writes its record, wakes its task and stores the source's
position, all in one write transaction. This doc covers that path, the tables behind it, and the
seed hook through which the core learns which definitions can fire.

The sketches in `sketches/definitions/` hold the type shapes and the texts of the refusals and
notices that have a text. This doc holds the rules. An item marked `(open: <name>)` is not settled,
and [the open list](open/definitions.md) holds it. The section "Built" describes the code as it is.
Every other section describes the design.

The [glossary](../../glossary.md) defines trigger, task, record, projection, lease and connector.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition, definition hash, seed and in
  force.
- [The task of a definition](definition-tasks.md) defines definition's task, out of force and
  erasable field.
- [Task runs of a definition](definition-task-runs.md) defines fire, slot, dedupe key and skip. It
  covers the records `trigger.fired` and `trigger.skipped`.
- [Schedules](schedules-and-triggers.md) defines one-shot, spent one-shot and schedule source.

Terms this doc adds:

- **Trigger source.** Code that watches for the fires of one kind of trigger, such as the schedule
  source.
- **Event.** The object by which a trigger source hands one fire to the trigger core.
- **Cursor.** The position of a trigger source in its outside system, such as a sync token. The
  trigger core stores it for the source.
- **Armed.** A definition is armed when it is in force and has a trigger. Only an armed definition
  can fire.
- **Withdrawn.** A definition is withdrawn when it was armed and is out of force.
- **Watermark.** One instant per armed definition. nixie looks for the definition's next fire after
  that instant.
- **Pending fire.** The first fire of an armed definition after its watermark.
- **Stale event.** An event that the trigger core drops because it fits no armed definition, or
  because its time is not after the watermark.

## Built

The design uses this built code:

- The [trigger source design](../platform/channels/trigger-source.md#the-interface) holds the
  interfaces `TriggerSource`, `TriggerContext` and `TriggerEvent`. The code holds none of them.
- `withWriteTransaction` runs each write transaction.
- [Decision 0016](../../decisions/0016-own-interfaces.md) lists the trigger source among the
  interfaces that nixie defines itself.

## The interface

The added members are in [the members that `TriggerEvent` adds](sketches/definitions/02-types.ts),
section H. An example call is in [a source delivers](sketches/definitions/01-usage.ts), section D.

- This design builds `TriggerSource`, `TriggerContext` and `TriggerEvent` as the
  [trigger source design](../platform/channels/trigger-source.md#the-interface) gives them.
- This design adds 5 members to `TriggerEvent`:

1. `definitionID` is the definition of the fire. The schedule source sets it on every event.
2. `definitionHash` is the definition version from which the source computed the event.
3. `kind` is `schedule`, `at` or `poll`.
4. `catchUp` holds the scheduled times that the source missed before this fire, and their number.
5. `skip` is set when the source itself decided that the fire is a skip. It holds the reason and the
   scheduled times.

## The records and the tables

The shapes are in
[`trigger.armed`, `trigger.delivered` and the 3 tables](sketches/definitions/02-types.ts), section
H.

- nixie writes `trigger.armed` when a seed arms a definition, alters an armed definition or
  withdraws one. No other record does any of these.
- nixie writes `trigger.delivered` when a `deliver` call takes a dedupe key or stores a cursor. No
  other record does either.
- Both records sit on no thread, and both have no erasable field.
- `trigger_sources`, `trigger_keys` and `trigger_definitions` are projections.
- `trigger_sources` holds the cursor of each source.
- `trigger_keys` holds each taken dedupe key. Its primary key is the source ID, a line break and the
  dedupe key.
- nixie never deletes a row of `trigger_keys`, so a taken dedupe key is taken for as long as the
  deployment exists. One 5-minute schedule adds about 105,000 rows a year.
- `trigger_definitions` holds one row per definition that is armed or withdrawn. The row holds the
  source, the definition hash, the target, the trigger and the watermark. The hash is null for a
  withdrawn definition.
- The trigger core stores no state of a task run and reads no record of one. For each fire it asks
  `readDefinitionTask`, which [task runs of a definition](definition-task-runs.md) covers.

## The pending fire and the watermark

How each record moves the watermark is in [the watermark](sketches/definitions/03-flow.ts), section
E.

- `readNextFire(trigger, after, zone)` returns the pending fire of a definition: the first fire time
  after the watermark `after`.
- nixie stores no time of a pending fire. A change of your time zone therefore moves the next fire
  at once, and a rebuild of the tables computes no fire time.
- The watermark is in epoch milliseconds. No fold moves it back.
- The fold of `trigger.armed` sets the watermark to the time of the record in 3 cases: the
  definition has no row; the definition was withdrawn; or the `trigger` of the definition differs
  from the row.
- When a seed alters a definition and its `trigger` is the same, the fold of `trigger.armed` does
  not move the watermark. A fire that was due just before an edit of `instructions.md` is therefore
  not lost: the source builds it again with the hash of the edited version.
- The fold of `trigger.fired` moves the watermark to the scheduled time of the fire.
- The fold of `trigger.skipped` moves the watermark to the newest scheduled time of the skip. The
  slots that a skip covers therefore never fire.
- A one-shot does not use the watermark. `readNextFire` returns the instant of its `at` for any
  watermark, and no fold moves the watermark for an `at` event. Only the dedupe key decides whether
  a one-shot fires.
- `readArmedDefinitions` returns the armed definitions of one source. It omits a spent one-shot.

## The seed hook

- `writeArmedDefinitions` is the seed hook of the triggers module.
- `runSeed` and `runInForceSeed` call the hook inside the seed's transaction.
- The seed calls the hook after all its checks have passed, and after the hook that binds each
  definition's task. A seed that nixie refuses therefore arms no definition.
- The seed calls the hook before it can return `unchanged`. The hook therefore runs at every
  accepted seed, also when the definitions are the same as at the seed before.
- The seed passes the hook each definition in force that has a trigger, less each spent one-shot.
  The seed computes no fire time.
- The hook compares its list with the rows of `trigger_definitions`. When they differ, it writes one
  `trigger.armed` record. When they agree, it writes no record.
- The definitions module imports the triggers module and calls the hook directly (open: triggers
  imports). The server app does not pass the hook in as a function, because a seed path that got no
  function would skip the hook.

## One `deliver` call

The steps as code are in [`deliverTriggerBatch`](sketches/definitions/03-flow.ts), section F.

A trigger source calls `TriggerContext.deliver` with a batch: a cursor and a list of events. The
call runs `deliverTriggerBatch`, which is one write transaction. For each event in order, the
trigger core does the first of these that fits:

1. **A taken key.** `trigger_keys` holds the event's dedupe key, or an event before it in the batch
   took it. The core ignores the event.
2. **No definition.** The event holds no `definitionID`. The core throws, and the transaction
   commits no part of the batch.
3. **A stale event.** The definition has no row, is withdrawn, is armed on another source or holds
   another hash. Or the event's scheduled time is at or before the watermark. The core ignores the
   event: it writes no record and takes no key. The watermark test does not apply to an `at` event.
4. **A skip from the source.** The event holds `skip`. The core writes `trigger.skipped` with the
   reason of the source.
5. **A conversation target.** The definition has `target: conversation`. The core writes
   `trigger.fired` on the conversation's thread. It looks up no task.
6. **A task target.** The core calls `readDefinitionTask` and writes the record for its answer:
   `trigger.fired` on the task's thread for `take`, `trigger.skipped` with `still_running`, or
   `trigger.skipped` with `task_held`.

Rules for the steps:

- Only a source of poll triggers builds an event without a `definitionID`, and this design has no
  such source. Step 2 guards the cursor: a cursor must not commit past an event that the core cannot
  place.
- The core writes the record of an event before it handles the next event. `readDefinitionTask`
  therefore sees that record. A second fire of one definition in one batch gets `trigger.skipped`
  with `still_running`.
- When `readDefinitionTask` returns null, the definition has no bound task. The seed binds each task
  before it arms the definition, so null is a fault. The core throws, and the transaction commits no
  part of the batch.
- After the record of an `at` event, the core calls `retireOneShot`, which
  [schedules](schedules-and-triggers.md) covers.
- After the last event, the core writes one `trigger.delivered` record with the taken keys and the
  cursor. When the call took no key and the cursor is the stored one, the core writes no record.
- The call returns the number of events that took a key.
- The cursor of a source commits in the same transaction as its fires.
- `trigger.fired` wakes its task with the cause `event`. The tasks design counts the hops of a
  message between tasks, and a wake with the cause `event` sets that count to 0.
- The core takes no lease. The woken task claims its own lease.

Two cases at the edge of a slot:

- A seed can alter or withdraw a definition while the source holds an event of the old version. That
  event is stale by step 3. When the definition is armed and its trigger is the same, the source
  builds the fire again at its next tick, with the hash in force.
- A skip takes the dedupe key of its slot. When you disable a definition after a skip and enable it
  again inside the same slot, the definition does not fire in that slot.

## Crashes, clocks and restores

- When `deliver` throws, or nixie dies before the commit, nixie has written no record and taken no
  key. The source builds the same events with the same dedupe keys at its next tick.
- When nixie dies after the commit, `trigger_keys` holds the keys. The source's next tick takes none
  of them again.
- When 2 writes of one dedupe key reach `trigger_keys`, the primary key fails the second write, and
  its whole transaction fails.
- When the clock moves back, nixie delivers no fire twice: `trigger_keys` holds the taken keys, and
  no watermark moves back.
- A restored backup holds its `trigger_keys` rows and its watermarks. nixie does not repeat a fire
  that the backup holds. A fire that fell due after the backup is a missed fire, which
  [schedules](schedules-and-triggers.md) covers.
- A version of nixie without this design never calls the seed hook, so the rows of
  `trigger_definitions` can differ from the definitions in force after a rollback and an upgrade.
  The first seed after the upgrade writes `trigger.armed` and corrects the rows. Until then, step 3
  drops each event whose hash differs from its row.

## Fires for a held task

- A task cannot take a step while it is paused, stopped, failed or held at its limit.
- When a fire targets such a task, the core writes `trigger.skipped` with `task_held`. The fold
  moves the watermark.
- The definition fires again at the first slot after you resume the task, restart it or raise its
  limit.
- A task under a recovery hold also counts as such a task (open: recovery hold fire).
  [Backup and recovery](backup-and-recovery.md) owns the recovery hold, and it owns what nixie does
  at a start while a recovery hold is open. The trigger core adds no rule for that.
- A `trigger.fired` record that nixie wrote before the task was held opens a task run after you
  resume the task, restart it or raise its limit, however old the record is. A restored backup can
  contain such a record unread.
- When a task run never ends, each fire of its definition gets `trigger.skipped` with
  `still_running`.

## Boundaries

- The triggers module owns the `TriggerSource` port, the trigger core and the schedule source. The
  trigger core is `deliver`, the cursors, the dedupe keys and the health of each source.
- The trigger core is not part of the tasks module, for 2 reasons. Decision 0016 lists the trigger
  source among the interfaces that nixie defines itself. A source of poll triggers depends on
  connectors, and the tasks module must not depend on them.
- A trigger source that calls an outside system is an adapter named `trigger-<system>`, or it calls
  that system through a connector.
- The triggers module imports the tasks module and the log module (open: triggers imports).
- The server app passes `readDefinitionTask` and `retireOneShot` into the trigger core. The triggers
  module therefore does not import the definitions module, and the modules form no cycle.
- The server app starts each trigger source when the app starts, and stops each when the app stops.
- The health of a source is `running`, `unhealthy` or `stopped`. A source reports it through
  `reportHealth`.
- The trigger core adds no config key.

## Not in scope

- Trigger sources for polls, webhooks and streams.
- The match of an event without a `definitionID` to a definition.
- A stop of the trigger sources while a recovery hold is open.
- A table of fires that are due, and a cursor that nixie holds back from a commit.
