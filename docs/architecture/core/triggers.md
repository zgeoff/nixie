# Triggers

A definition with a `schedule` trigger fires at repeating times in a time zone, and one with an `at`
trigger fires once. Every trigger source hands its fires to one piece of code, the trigger core,
which takes each fire at most once. It writes the fire's record, wakes the task and stores the
source's cursor in one write transaction, so a crash leaves either all of that or none of it. The
triggers module holds the core, the arming hook, the pure time code and the schedule source, the one
trigger source the server starts.

The `target` column of a `trigger_definitions` row and the `target` field of an armed entry name the
thread a fire lands on: `task` for a definition, `conversation` for a reminder.

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

A source can instead hand over a task input: an event for one task's thread, which names no
definition. The [coding source](./coding-tasks.md#the-coding-source) hands over each session event
this way. The core writes each task input as a `trigger.task_input` record, with the event's own
text in its erasable fields. It drops an input whose dedupe key the source already delivered, or
whose task is missing, stopped or finished. A dropped input takes no dedupe key, so the same event
can still land on the task that binds its session next. The input carries a `wake` flag: with it,
the record joins the task's inbox and wakes the task; without it, the record lands on the thread and
no step reads it.

A source can also hand over a mail arrival or a text arrival, which name no definition and no task.
The core matches it against the wake rules of its mailbox and wakes each target a ready rule names.
[The mailbox](./mailbox.md#the-arrival-path) covers the rules, the held matches and the wake flush,
which the triggers module holds.

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
leaves it. A zone change therefore moves the next fire at once, because nixie never stores the time
of a pending fire. A `trigger.fired` moves the watermark to its slot, and a `trigger.skipped` to its
newest slot, so the slots a skip covers never fire. No fold moves a watermark back, and none moves
it for an `at` trigger.

## One deliver call

`deliverTriggerBatch` is one write transaction. For each event in order, the first row that fits
decides:

| #   | When                                                                                                                                  | Written                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `trigger_keys` holds the event's key, or an earlier event of the batch took it                                                        | nothing                                                                 |
| 2   | the definition has no row, is withdrawn, is on another source or holds another hash; or a schedule slot is at or before the watermark | nothing                                                                 |
| 3   | `readDefinitionTask` answers `wait`, or a conversation target's [gate](./pause.md#the-task-gate) answers `nixie` or `spend`           | nothing; the key stays free                                             |
| 4   | `readDefinitionTask` answers `held`                                                                                                   | `trigger.skipped` with `task_held`                                      |
| 5   | the event holds `skip`                                                                                                                | `trigger.skipped` with that reason                                      |
| 6   | the trigger's `target` is `conversation`, which a [reminder](./reminders.md) arms                                                     | `trigger.fired` on the conversation's thread                            |
| 7   | `readDefinitionTask` answers `take`, or `revive` for a failed task                                                                    | `trigger.fired` on the task's thread, after `task.revived` for `revive` |
| 8   | `readDefinitionTask` answers `still_running`                                                                                          | `trigger.skipped` with `still_running`                                  |

`readDefinitionTask` answers `wait` when nixie's pause or the spending stop holds the task. For a
task target, a done, stopped or closed task outranks the stop and nixie's pause, so it reaches row
4, while a failed task, a task at a limit and a task paused by the user rank below them, so row 3
holds the fire first. A held task outranks the event's own skip, so a late fire at a paused task
records `task_held`. A conversation target heeds only nixie's pause and the spending stop, whatever
the conversation's state, so a reminder still lands in a conversation that the user paused. A fire
that row 3 holds takes no key, so the source's next tick builds the same event again. The slot is
then late, and the catch-up rule of [the schedule source](#the-schedule-source) decides: one
catch-up within half the interval, otherwise a `too_late` skip. A one-shot leaves force only when
its fire is written or skipped, so a one-shot that waits stays armed.

Each record is written before the core reads for the next event, and its fold adds the key to
`trigger_keys` at once. A second fire of one definition in one batch therefore skips with
`still_running`. A null answer from `readDefinitionTask` throws and the batch commits nothing,
because the seed binds each task before it arms the definition. Writing one key twice fails the
primary key of `trigger_keys`, and with it the transaction.

The core writes `trigger.fired` through the tasks module's inbox writer, which wakes the task with
the cause `event` and sets the [hop count](./task-messages.md#the-hop-limit) of messages between
tasks to 0. It writes `trigger.skipped` through the log module, and a skip wakes nothing. A fire's
`isCatchUp` is true when the core's clock is later than the slot by more than the catch-up
threshold. A `trigger.skipped` lists the 20 newest slots it covers, with the full count.

`trigger.fired` holds the hash of the version that a task run of this fire pins, so the task run
reads the definition the fire was armed with. A skip's reason is one of `too_late`, `catch_up_off`,
`window_closed`, `still_running` or `task_held`. A skip takes the dedupe key of its newest slot, so
a definition that is disabled and enabled again inside a skipped slot never fires in it.

After the record of an `at` event, the core writes a `trigger.armed` that withdraws the definition
and calls `retireOneShot`, which puts the task's hash out of force, in the same transaction. The
core writes `trigger.delivered` only when the batch's cursor differs from the stored one.

### Crashes, clock changes and restores

The conversation task exists before any source starts, so a fire for it never finds the task
missing. When `deliver` throws or nixie dies before the commit, nothing is written, and the source
builds the same events with the same keys at its next tick. When the clock moves back, nixie never
delivers a fire twice. A restored backup holds its keys and watermarks, so nixie never repeats a
fire it holds, and a fire due after the backup is a missed fire. Until the first seed corrects the
armed rows, the core drops each event whose hash differs from its row. `trigger_keys` grows by one
row per fire or skip, so a schedule that fires every few minutes adds tens of thousands of rows a
year.

### Modules

The triggers module imports the tasks module, the log module and the clock lib, and the definitions
module imports the triggers module, so the imports form no cycle. A trigger source that calls an
outside system is an adapter named `trigger-<system>`, or it calls that system through a connector.

## The spent one-shot

A one-shot is spent when `trigger_keys` holds its dedupe key. nixie stores the fact nowhere else.
Every seed asks `readSpentOneShots` and leaves a spent one-shot out of both hook lists, so the file
of a spent one-shot stays as written and a disabled-then-enabled one does not fire again. An edit of
the `at` to another instant gives another key, so the one-shot fires at the new instant. An edit to
an instant whose key is taken makes the one-shot spent at the next seed.

## The schedule shape

A `schedule` trigger holds a `repeat`, optional `hours`, a `zone` and `catchUp`:

```yaml
trigger:
  schedule:
    repeat:
      frequency: monthly # minutely | hourly | daily | weekly | monthly | yearly
      interval: 1 # every nth frequency, default 1
      byDay: [{ day: fri, nth: -1 }] # weekdays, with an optional nth, -1 for the last
      byMonthDay: [1, -1] # days of the month, -1 for the last
      byMonth: [3, 9]
      at: ['17:00'] # times of day; daily and longer frequencies need it
      starts: '2026-11-23' # the date a step count measures from
    hours: { from: '09:00', until: '17:00' } # limits when it may fire, both ends included
    zone: owner
    catchUp: once
```

The `repeat` follows the recurrence rule of RFC 5545. `hours` with an end before its start runs past
midnight. `starts` defaults to the local date the schedule is set. A schedule that counts from it or
takes a day from it needs it given, so an edit never moves it: an interval above 1, a weekly
schedule with no `byDay`, and a monthly or yearly schedule with no `byDay` or `byMonthDay`. Nix
writes the structure and never recurrence rule text.

`checkSchedule` is the one check of a new schedule, and a reminder tool and `task.define` both call
it. It is pure. It checks the fields as given, then fills `starts` and sorts the times of `at`, and
refuses with a code, the field's path and a sentence that says how to fix it when:

- a field is missing or never goes with the others: `AT_REQUIRED`, `AT_NOT_ALLOWED`,
  `NTH_NOT_ALLOWED`, `BY_MONTH_DAY_NOT_ALLOWED`, `STARTS_REQUIRED`;
- the schedule has no fire within the check's horizon, which runs from now or from its `starts`,
  whichever is later: `NO_FIRE`;
- the smallest gap among its next fires is under the minimum gap, which is not a fixed interval:
  `MIN_GAP`.

A `task.yaml` in the definitions repo takes the same shape, and the seed refuses a mix of fields the
same way, with the field and the fix.

### The older shape

Records written before the `repeat` shape hold `every` (`day`, `week`, `hour` or `{ minutes }`),
`at`, `on`, `window` and `idleMinutes`, and each stays readable forever. The contract schema accepts
both shapes, and new writes use only `repeat`. `toNormalizedSchedule` converts an older schedule
when it is read, with no migration of the log and no new hash for a stored version:

| Older shape               | Read as                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `day` with `at`           | `daily` with `at`                                                       |
| `week` with `on` and `at` | `weekly` with `byDay`                                                   |
| `hour`                    | `hourly`                                                                |
| `{ minutes }`             | `minutely` counted from the Unix epoch, so each fire time stays         |
| `window`                  | `hours`, with the slot at `window.from`, once per window, as before     |
| `idleMinutes`             | kept for the window's idle wait; the `repeat` shape has no such setting |

A reminder that fires always interrupts, so the `repeat` shape has no setting for when the user is
busy, and `hours` belongs to one reminder or task, never to the user.

## Fire times

`pickNextFire` is pure code over the runtime's zone data. It returns the first slot strictly after a
watermark, with the end of the window of an older window schedule and the dedupe key. The search has
no limit in days: a schedule is refused when it has no fire within the check's horizon, and a rule
that never fires again, such as the 30th of February, returns null.

Recurrence expands in one function, `pickNextWallTime`, which wraps the `rrule-temporal` library.
The function reads and returns local wall times and gives the rule no time zone, because the library
drops a time that falls in a spring-forward gap when a rule has one.
[Decision 0018](../../decisions/0018-use-rrule-temporal-for-recurrence.md) gives the reason. nixie
maps each wall time onto the clock:

- A `daily`, `weekly`, `monthly` or `yearly` fire is a local date and time. A time that the clock
  skips fires at the first instant after the gap, and a time that it shows twice fires at the first
  of the two.
- `hours` filters the candidates of a calendar frequency by their local minute of the day.
- An `hourly` schedule counts elapsed time: with an interval of 1 it fires whenever the zone's clock
  shows minute 0, so it fires 25 times on the day the clock goes back and 23 on the day it goes
  forward. `byDay`, `byMonthDay`, `byMonth` and `hours` then drop the fires they exclude, so
  "hourly, 9 to 5 on weekdays" fires at each hour from 09:00 to 17:00 on Monday to Friday.
- A `minutely` schedule, and an `hourly` one with an interval above 1, fires at each step from the
  start of its `starts` date. An older `{ minutes }` schedule counts from the Unix epoch.
- An `at` trigger gives its instant for any watermark.
- `collectNextFires` gives the next several fires after a watermark.

The key of a calendar fire is `<definitionID>|<local date>T<HH:MM>`, so one local slot fires at most
once when the zone changes that day. The key of any other fire is `<definitionID>|<UTC instant>`.

## Snooze and skip

A `trigger.deferred` record moves one fire of a recurring trigger, and never writes a new version,
so the hash and the history of the reminder stay as they are. It names the definition and the slot:

- A skip has `until` null. The fold moves the watermark to the slot, so the slot never fires.
- A snooze has `until` set. The fold stores the slot and the instant in the `hold_slot` and
  `hold_until` columns of the `trigger_definitions` row. The source waits while now is before
  `hold_until`, and slots after the held one wait behind it. The held slot fires once its hold ends,
  however late that is.

A new trigger drops the hold, and an edit of the name or the note alone keeps it. A record for a
slot at or before the watermark, or for a one-time trigger, changes nothing. The two columns are
part of the projection, so a rebuild from the log fills them again.

`renderTrigger` gives the words of a trigger in a zone, naming the zone, and its next fire.
`readDefinitionNextFire` reads a definition's row and returns its next slot as an ISO instant, also
when the slot is already past, and null for a missing or withdrawn row or a spent one-shot.
`readDefinitionNextFires` returns the next several slots, with the zone, for the read-back of a
reminder tool. The server resolves the zone `owner` through `ReadZone`: the zone of the newest
message that carries one, else the configured default zone.

## The schedule source

`buildScheduleSource` returns the source of `schedule` and `at` triggers, with the ID `schedule`. It
is an xstate machine that ticks at once when it starts, then on a fixed interval on the writer's
clock. Each tick runs as tracked work, so the crash harness's settled advance waits for it and its
delivery. A tick reads the armed definitions, the time, the time of the newest owner message and the
zone of each definition, builds at most one event per definition, and delivers all the events of the
tick in one batch. A tick with no event delivers nothing. The source keeps no state between ticks,
so a fire is within the catch-up threshold of its slot when nixie is running.

The pure function `pickScheduleEvent` builds an event. It walks the slots from the watermark up to
now. The newest due slot is the event's `scheduledFor` and its key. The earlier due slots are
`missed`, the newest of them, oldest first and capped by a constant,, and `missedCount` is their
full number. The first row of this table that fits decides, where late is the time since the newest
slot:

| #   | Trigger                             | When                                                       | Event                    |
| --- | ----------------------------------- | ---------------------------------------------------------- | ------------------------ |
| 1   | `at`                                | its instant is at or before now, however late              | fire, never a skip       |
| 1a  | a slot that a snooze held           | its hold has ended, however late                           | fire                     |
| 2   | window with `idleMinutes`           | now is at or before `until`, and the owner is idle         | fire                     |
| 3   | window with `idleMinutes`           | now is at or before `until`, and the owner is not idle yet | none; a later tick tries |
| 4   | window with `idleMinutes`           | now is after `until`                                       | skip `window_closed`     |
| 5   | window without `idleMinutes`        | now is at or before `until`                                | fire                     |
| 6   | any other schedule                  | within the threshold                                       | fire                     |
| 7   | any other schedule, `catchUp: skip` | past the threshold                                         | skip `catch_up_off`      |
| 7a  | `hours` in the repeat shape         | past the threshold, and now is outside the hours           | skip `too_late`          |
| 8   | any other schedule, `catchUp: once` | past the threshold, at most half the interval              | fire, a catch-up         |
| 9   | any other schedule, `catchUp: once` | late by more than half the interval                        | skip `too_late`          |

The owner is idle when no message exists or the newest is at least `idleMinutes` old. Rows 2 to 5
apply to a schedule in the older window shape only. The interval is the nominal length of the
frequency times its interval: a minute, an hour, a day, a week, a month or a year, each at its
nominal length. A window without `idleMinutes` that is past `until` takes rows 6 to 9, with its
lateness measured from `window.from`. An event whose newest slot is on time still carries the
earlier missed slots, under either `catchUp` value.

A slot whose key is taken, such as a local slot that a zone change brings round again, builds the
same event at each tick until the next slot, and the core writes nothing for it.

The source reports `running` at start. After 3 failed ticks in a row, from any failed read or
delivery, it reports `unhealthy`, and the next good tick reports `running` again. A failed tick
never stops the loop, and a source built after a restart counts from 0. `stop` aborts the sleep,
waits for a tick in flight and reports `stopped`.
