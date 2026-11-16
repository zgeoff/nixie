# Triggers

A definition with a `schedule` trigger fires at repeating times in a time zone, and one with an `at`
trigger fires once. Every trigger source hands its fires to one piece of code, the trigger core,
which takes each fire at most once. It writes the fire's record, wakes the task and stores the
source's cursor in one write transaction, so a crash leaves either all of that or none of it. The
triggers module holds the core, the arming hook, the pure time code and the schedule source, the one
trigger source the server starts.

## What a source hands over

A source implements `TriggerSource` and receives a `TriggerContext` when it starts.
`startTriggerSources` builds the context per source with:

- the cursor that nixie last committed for the source, null for a source that has none;
- `deliver`, which commits a batch of events and a cursor under the source's ID;
- `reportHealth`, which keeps the latest health in memory and logs each change;
- a signal that aborts at stop.

An event names one definition, the hash of the version the source computed it from, the dedupe key
of its slot, the slots that were missed before it, and an optional `skip` reason when the source has
already decided to skip.

## Which definitions can fire

The seed calls `writeArmedDefinitions` at every accepted seed, right after the hook that binds each
task and before the seed can return `unchanged`. The hook compares the definitions in force that
hold a trigger with the `trigger_definitions` rows. It writes one `trigger.armed` record when they
differ, listing each definition that is new, changed or back in force, and the IDs of those out of
force. It writes nothing when they agree. A definition that is disabled, has no trigger or is a
spent one-shot is out of the list.

The `trigger_definitions` fold keeps a watermark per definition: the instant after which nixie looks
for the next fire. The watermark starts at the time of the `trigger.armed` record when the
definition is new, was withdrawn or has another trigger, and an edit of the instructions alone
leaves it. A zone change therefore moves the next fire at once, because nixie stores no time of a
pending fire. A `trigger.fired` moves the watermark to its slot, and a `trigger.skipped` to its
newest slot, so the slots a skip covers never fire. No fold moves a watermark back, and none moves
it for an `at` trigger.

## One deliver call

`deliverTriggerBatch` is one write transaction. For each event in order, the first row that fits
decides:

| #   | When                                                                                                                                  | Written                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `trigger_keys` holds the event's key, or an earlier event of the batch took it                                                        | nothing                                               |
| 2   | the definition has no row, is withdrawn, is on another source or holds another hash; or a schedule slot is at or before the watermark | nothing                                               |
| 3   | the event holds `skip`                                                                                                                | `trigger.skipped` with that reason                    |
| 4   | the definition has `target: conversation`                                                                                             | `trigger.fired` on the conversation's thread          |
| 5   | `readDefinitionTask` answers `take`                                                                                                   | `trigger.fired` on the task's thread                  |
| 6   | `readDefinitionTask` answers `still_running` or `held`                                                                                | `trigger.skipped` with `still_running` or `task_held` |

Each record is written before the core reads for the next event, and its fold adds the key to
`trigger_keys` at once. A second fire of one definition in one batch therefore skips with
`still_running`. A null answer from `readDefinitionTask` throws and the batch commits nothing,
because the seed binds each task before it arms the definition. Writing one key twice fails the
primary key of `trigger_keys`, and with it the transaction.

`trigger.fired` goes through the tasks module's inbox writer, which wakes the task with the cause
`event`. Its `isCatchUp` is true when the core's clock is later than the slot by more than the
catch-up threshold. A `trigger.skipped` lists the 20 newest slots it covers, with the full count.

After the record of an `at` event, the core writes a `trigger.armed` that withdraws the definition
and calls `retireOneShot`, which puts the task's hash out of force, in the same transaction. The
core writes `trigger.delivered` only when the batch's cursor differs from the stored one.

## The spent one-shot

A one-shot is spent when `trigger_keys` holds its dedupe key. nixie stores the fact nowhere else.
Every seed asks `readSpentOneShots` and leaves a spent one-shot out of both hook lists, so the file
of a spent one-shot stays as written and a disabled-then-enabled one does not fire again. An edit of
the `at` to another instant gives another key, so the one-shot fires at the new instant.

## Fire times

`pickNextFire` is pure code over the runtime's zone data, with no port and no date library. It
returns the first slot strictly after a watermark, with the end of the window and the dedupe key.

- A `day` or `week` schedule fires at its local time. A time that the clock skips fires at the first
  instant after the gap, and a time that it shows twice fires at the first of the two.
- A window schedule gives `window.from` as the slot and `window.until` as the end, on the next local
  day when it is not after the start.
- An `hour` schedule fires whenever the zone's clock shows minute 0, so it fires 25 times on the day
  the clock goes back and 23 on the day it goes forward.
- A minutes schedule fires at each whole multiple of its interval since the Unix epoch, so nixie
  stores no start time.
- An `at` trigger gives its instant for any watermark.

The key of a `day` or `week` fire is `<definitionID>|<local date>T<HH:MM>`, so one local slot fires
at most once when the zone changes that day. The key of any other fire is
`<definitionID>|<UTC instant>`.

`renderTrigger` gives the words of a trigger and the date of its next fire in a zone.
`readDefinitionNextFire` reads a definition's row and returns its next slot as an ISO instant, also
when the slot is already past, and null for a missing or withdrawn row or a spent one-shot. The
server resolves the zone `owner` through `ReadZone`: the zone of the newest message that carries
one, else the configured default zone.

## The schedule source

`buildScheduleSource` returns the source of `schedule` and `at` triggers, with the ID `schedule`. It
is an xstate machine that ticks at once when it starts, then every 20 seconds on the writer's clock.
Each tick runs as tracked work, so the crash harness's settled advance waits for it and its
delivery. A tick reads the armed definitions, the time, the time of the newest owner message and the
zone of each definition, builds at most one event per definition, and delivers all the events of the
tick in one batch. A tick with no event delivers nothing. The source keeps no state between ticks,
so a fire is within 60 seconds of its slot when nixie is running.

The pure function `pickScheduleEvent` builds an event. It walks the slots from the watermark up to
now. The newest due slot is the event's `scheduledFor` and its key. The earlier due slots are
`missed`, the 20 newest of them oldest first, and `missedCount` is their full number. The first row
of this table that fits decides, where late is the time since the newest slot:

| #   | Trigger                             | When                                                       | Event                    |
| --- | ----------------------------------- | ---------------------------------------------------------- | ------------------------ |
| 1   | `at`                                | its instant is at or before now, however late              | fire, never a skip       |
| 2   | window with `idleMinutes`           | now is at or before `until`, and the owner is idle         | fire                     |
| 3   | window with `idleMinutes`           | now is at or before `until`, and the owner is not idle yet | none; a later tick tries |
| 4   | window with `idleMinutes`           | now is after `until`                                       | skip `window_closed`     |
| 5   | window without `idleMinutes`        | now is at or before `until`                                | fire                     |
| 6   | any other schedule                  | late by at most 60 seconds                                 | fire                     |
| 7   | any other schedule, `catchUp: skip` | late by more than 60 seconds                               | skip `catch_up_off`      |
| 8   | any other schedule, `catchUp: once` | late by more than 60 seconds, at most half the interval    | fire, a catch-up         |
| 9   | any other schedule, `catchUp: once` | late by more than half the interval                        | skip `too_late`          |

The owner is idle when no message exists or the newest is at least `idleMinutes` old. The interval
is 24 hours for `day`, 7 days for `week`, 1 hour for `hour` and the number of minutes for a minutes
schedule. A window without `idleMinutes` that is past `until` takes rows 6 to 9, with its lateness
measured from `window.from`. An event whose newest slot is on time still carries the earlier missed
slots, under either `catchUp` value.

A slot whose key is taken, such as a local slot that a zone change brings round again, builds the
same event at each tick until the next slot, and the core writes nothing for it.

The source reports `running` at start. After 3 failed ticks in a row, from any failed read or
delivery, it reports `unhealthy`, and the next good tick reports `running` again. A failed tick
never stops the loop, and a source built after a restart counts from 0. `stop` aborts the sleep,
waits for a tick in flight and reports `stopped`.
