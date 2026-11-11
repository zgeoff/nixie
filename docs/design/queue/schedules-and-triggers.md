# Schedules and one-shots

A task definition with a `schedule` trigger fires at repeating times in your time zone, and one with
an `at` trigger fires once. This doc covers when each fires, what nixie does with a fire that it
missed while it was down, and how a definition that fires once goes out of force.

The sketches in `sketches/definitions/` hold the type shapes and the texts of the refusals and
notices that have a text. This doc holds the rules. An item marked `(open: <name>)` is not settled,
and [the open list](open/definitions.md) holds it. The section "Built" describes the code as it is.
Every other section describes the design.

The [glossary](../../glossary.md) defines conversation, trigger, task run and record.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition, definition ID, seed, seed record
  and in force.
- [The task of a definition](definition-tasks.md) defines definition's task, hash in force and out
  of force.
- [Task runs of a definition](definition-task-runs.md) defines fire, slot, dedupe key, catch-up and
  skip.
- [The trigger core](trigger-core.md) defines trigger source, event, cursor, armed and pending fire.
  It covers `deliver`, the call by which a trigger source hands its events to nixie.

Terms this doc adds:

- **Schedule.** A trigger that fires at repeating times.
- **One-shot.** A definition whose trigger is `at`. It fires once.
- **Spent one-shot.** A one-shot whose one fire nixie has delivered or skipped.
- **Interval.** The time between 2 slots of a schedule.
- **Window.** A span of local time in which a `day` or `week` schedule can fire.
- **Schedule source.** The trigger source that produces the fires of `schedule` and `at` triggers.
- **Tick.** One pass of the schedule source.

## Built

The design uses this built code:

- `readMessageTimeZone` reads the time zone of your newest message. The config key
  `time.default_zone` gives the zone when you have sent no message.
- `isTimeZone` in the contract lib checks a zone name against the runtime's zone data.
- The e2e harness starts a real nixie process. A suite advances that process's clock through
  `harness.advance`.
- The backup schedule, the lapse sweeps and the definitions poll each have a timed loop of their
  own.

## The keys of a schedule

The type is [`Schedule`](sketches/definitions/02-types.ts), section B. nixie checks every rule of
this section and the next at a seed, and refuses a seed that breaks one.

- `every` is `day`, `week`, `hour` or a number of minutes. This doc calls the last a minutes
  schedule.
- The number of minutes is a whole number from 5 to 1440. With a floor of 1, a schedule could be
  costly by accident: every task run can spend up to the default limit of a task run.
- `at` is a local time as `HH:MM` on the 24-hour clock.
- A `day` or `week` schedule must hold `at` or `window`, and not both.
- An `hour` schedule and a minutes schedule must not hold `at`.
- `on` is a weekday from `mon` to `sun`. A `week` schedule must hold `on`. No other schedule can
  hold it.
- `window` holds 2 local times, `from` and `until`. Only a `day` or `week` schedule can hold it.
- When `until` is a clock time before `from`, the window ends on the next day.
- `idleMinutes` is a whole number from 1 to 720. Only a schedule with `window` can hold it.
- `zone` is the value `owner` or an IANA zone name. It is `owner` when the schedule omits it.
- With `owner`, the schedule uses the zone of your newest message. It uses `time.default_zone` when
  you have sent no message.
- `catchUp` is `once` or `skip`. It is `once` when the schedule omits it.

## The trigger `at`

- The value of an `at` trigger is an ISO 8601 date and time with an offset or `Z`.
- nixie refuses a seed that holds an `at` value without an offset or `Z`.

## Fire times

The fire time of each kind as code is in [`readNextFire`](sketches/definitions/03-flow.ts), section
E.

- A `day` or `week` schedule with `at` fires at that local time.
- A `day` or `week` schedule with `window` fires inside the window. The section "A window" gives the
  time.
- An `hour` schedule fires at each instant at which the clock of its zone shows minute 0.
- A minutes schedule fires at each instant that is a whole multiple of its interval since the Unix
  epoch. nixie therefore stores no start time for it. A stored start time would differ after a
  restore or a first seed on another host.
- An `at` trigger fires once, at its instant.

Daylight saving, for a `day` or `week` schedule:

- When the clock skips a local time, the schedule fires at the first instant after the skipped span.
- When the clock shows a local time twice, the schedule fires at the first of the 2 instants.

Daylight saving, for an `hour` schedule and a minutes schedule:

- These 2 kinds fire on instants and have no local slot. An `hour` schedule therefore fires 25 times
  on the day the clock goes back one hour, and 23 times on the day it goes forward.

## Dedupe keys

- The dedupe key of a `day` or `week` fire holds the definition ID, the local date and the local
  time of the slot.
- One local slot therefore fires at most once, also when your zone changes on that day. A key on the
  UTC instant would let one local slot fire twice on such a day.
- The dedupe key of an `hour` fire, a minutes fire and an `at` fire holds the definition ID and the
  UTC instant.
- A change of your zone can bring the same local slot of a `day` schedule round a second time. The
  trigger core finds that the key of the second fire is taken, and it writes no record. The schedule
  source builds the event of that slot again at each tick until the next slot is due, and each time
  the trigger core writes no record.

## The schedule source

The tick as code is in [the schedule source](sketches/definitions/03-flow.ts), section G. The
constants are in [the trigger core constants](sketches/definitions/02-types.ts), section H.

- The schedule source ticks every 20 seconds.
- At each tick the source reads the armed definitions, the zone and the clock. For each armed
  definition it builds one event: the latest fire that is due or missed.
- The source hands the events of one tick to nixie in one `deliver` call. Its cursor is null,
  because it stores no position.
- Between ticks the source holds one thing in memory: its count of failed ticks.
- The source reads the armed definitions at every tick. A change that a seed made therefore shows at
  the next tick, and nixie does not restart the source.
- The source sets no timer on a task. A timer belongs to a task and only a step's commit sets one,
  and a schedule fires when no task run is open. The
  [trigger source design](../platform/channels/trigger-source.md#the-interface) calls each next fire
  "a durable timer", and this design does not follow it there.
- A fire is on time when nixie delivers it within 60 seconds of its scheduled instant.
- The source takes the clock from its caller. A test advances that clock and does not sleep.
- A tick fails when its `deliver` call throws. After 3 failed ticks in a row, the source reports
  `unhealthy` through `reportHealth`.
- nixie holds the health of a source in memory only. A restart sets the count of failed ticks to 0.

## A missed fire

A fire is missed when the source did not deliver it on time. That happens after nixie was down, and
after any late tick.

- For each definition, the source takes only the latest missed fire.
- The interval is 24 hours for `day`, 7 days for `week`, 1 hour for `hour`, and the number of
  minutes for a minutes schedule.
- When `catchUp` is `once` and the fire is late by at most half the interval, the source builds one
  catch-up. The event lists the missed times before it in `skipped`.
- When `catchUp` is `once` and the fire is late by more than half the interval, the source builds
  one skip with the reason `too_late`.
- When `catchUp` is `skip`, the source builds one skip with the reason `catch_up_off`.
- A one-shot has no interval. The source builds a catch-up for a missed one-shot, however late it
  is. A late fire is better than no fire, and the model reads how late the fire is.
- When the first seed that holds a one-shot happens after the one-shot's instant, the one-shot is a
  missed fire.

## A window

- A schedule with `window` and without `idleMinutes` fires at `window.from`. When the source misses
  that time, the fire is on time until `window.until`.
- A schedule with `window` and `idleMinutes` fires at the first instant inside the window at which
  your last message to the conversation is at least that many minutes old.
- When `window.until` passes before such an instant, the source builds a skip with the reason
  `window_closed`.

## A spent one-shot

The flow as code is in [retiring a one-shot](sketches/definitions/03-flow.ts), section H.

- A one-shot is spent when the trigger core has taken its dedupe key. The trigger core takes the key
  when it writes `trigger.fired` or `trigger.skipped` for the one-shot.
- A one-shot gets `trigger.skipped` when its task is held or has a task run in progress.
  [Task runs of a definition](definition-task-runs.md) covers both skips. A missed one-shot gets no
  skip with `too_late`, by the rule in "A missed fire" (open: one-shot too late).
- nixie reads whether a one-shot is spent through `isSpentOneShot`, from the taken keys. It stores
  the fact in no other place, and it adds no member to the seed record.
- A one-shot goes out of force in the transaction that takes its key. In that transaction the
  trigger core calls `retireOneShot` with the cause `one_shot_fired` or `one_shot_skipped`.
- For a one-shot from the definitions repo, `retireOneShot` writes no record.
- For a one-shot that the agent made, `retireOneShot` writes `definition.settled`, a record of
  [definitions from chat](definitions-from-chat.md) (open: retireOneShot order).
- `retireOneShot` then runs a seed from the definitions in force, inside the same transaction.
- Every seed omits a spent one-shot from the lists that it passes to its 2 seed hooks.
  [The task of a definition](definition-tasks.md) and [the trigger core](trigger-core.md) cover the
  hooks. After that seed, the hash in force of the one-shot's task is null, and the one-shot is not
  armed.
- The file of a spent one-shot from the definitions repo is as you wrote it. nixie writes no seed
  record for the fact that the one-shot is spent.
- When you edit the `at` of a spent one-shot to another instant, the one-shot has another dedupe
  key. It is not spent, and it fires at that instant.
- When you edit the `at` to an instant whose dedupe key is taken, the one-shot is spent at the next
  seed. One definition therefore fires at most once at one instant.
- When you disable a spent one-shot and enable it again, it does not fire.

## Boundaries

- The schedule source is part of the triggers module, because it calls no system outside nixie.
- The time-zone arithmetic is pure code over the runtime's zone data. It has no port, and it uses no
  date library.
- Schedules add no config key.

## Not in scope

- Trigger sources for polls, webhooks and streams, and a trigger kind `log`.
- A move of the backup schedule, the lapse sweeps or the definitions poll onto the schedule source.
  Each uses its own timed loop.
- A test of a schedule against a production deployment.
