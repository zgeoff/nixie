# Reminders

A reminder is a note that the conversation sets for itself to read at a time, once or on a schedule.
When its trigger fires, the note reaches the conversation as a system message that wakes it, and no
task starts. A [definition](./definitions.md) starts a task, so a reminder lives apart from the
definitions: the reminders module owns reminders, never imports the definitions module, and the
server composes the two.

## What a reminder holds

A reminder holds a name, a note and a trigger, in the same `{ schedule }` or `{ at }` shape as a
definition's trigger. A schedule is a
[`repeat` with optional `hours`](./triggers.md#the-schedule-shape), such as every second Monday, the
last Friday of a month, or hourly from 09:00 to 17:00 on weekdays. The name and the note are text
the model wrote, so they never sit in a record's payload. Each version of a reminder is a row of
`reminder_versions`, keyed by the hash of its name, note and trigger, and a fire pins that hash as a
fire of a definition does.

Three records carry a reminder's life, on the conversation's thread: `reminder.set`,
`reminder.updated` and `reminder.cancelled`. Their payloads hold the reminder ID, its short ID, the
hash and the trigger. The `reminders` projection folds them, and it folds the `trigger.fired` and
`trigger.skipped` records of the trigger `reminder:<reminder ID>` as well. A one-time reminder is
`fired` once its fire or its skip lands, and a cancelled reminder is `cancelled`. A recurring
reminder stays `active`, and keeps its newest 3 fire times. The projection folds from records alone,
so a rebuild gives the same rows.

Each of the 3 writes also writes a `trigger.armed` record in the same transaction, so a reminder is
never armed without its record. The trigger ID is `reminder:<reminder ID>` and its target is
`conversation`, which makes the [trigger core](./triggers.md#one-deliver-call) write the fire on the
conversation's thread. The trigger core retires a one-time trigger after its fire, and for a
reminder it does nothing more, because the projection already marks the reminder fired.

The seed of the definitions withdraws every trigger it is not handed. It takes the active reminders
from the server as extra armed triggers, so a seed leaves the reminders armed.

## Tools

The conversation holds 6 tools, and no task's tool list holds any of them:

- **`reminder.set`** takes a name, a note and a trigger. An `at` with no offset reads in the user's
  zone.
- **`reminder.update`** takes a short ID and any of the name, the note and the trigger. A new
  trigger counts from now.
- **`reminder.cancel`** takes a short ID.
- **`reminder.snooze`** takes a short ID and `until`, and holds the next fire of a recurring
  reminder until that time. `until` must lie after that fire and before the fire after it.
- **`reminder.skip`** takes a short ID and drops the next fire of a recurring reminder.
- **`reminders.list`** lists the reminders that wait and the one-time reminders that fired in the
  last day, newest set first, in pages that stop at the output limit of a recall page, with a cursor
  for the next.

Snooze and skip write a `trigger.deferred` record, as
[snooze and skip](./triggers.md#snooze-and-skip) describes, and never a new version, so the
reminder's hash and history stay as they are. A one-time reminder takes neither: `reminder.update`
moves it.

`reminder.set`, `reminder.update`, `reminder.snooze` and `reminder.skip` read back `rendered`, the
schedule in words naming its zone, and `next`, the next 3 fires in local time with the zone's
offset.

A refusal comes back as `refused` with a code, the field's path and a sentence that says how to fix
it. A trigger is refused when its time has passed, when its schedule fails the
[schedule check](./triggers.md#the-schedule-shape), or when 2 of its next fires lie closer than
`reminders.min_gap_minutes`, which holds a default that the
[configuration](../deployment/configuration.md) lists.

The first five tools have the effect `note` and the last has the effect `read`. The starter rules
allow both effects, so no call asks the user for approval until the user's own rules say otherwise.

## How a fire renders

The `reminder` system message of [the conversation](./conversation-turns.md#system-messages) reads
the version by the hash that the fire pins, so a fire still renders after the reminder changes. The
API's record carries the name and the note beside the time. The message ends with the line "You can
handle this now, hand it to a task, set a one-off for later, or snooze or skip it." A reminder that
fires always interrupts the conversation, whatever the user is doing.

## The move from definitions

An earlier build let a definition hold `target: conversation`. The migration that removed it turns
each such definition into a reminder version and stages a row in `reminder_moves` for each one that
was armed, because a migration writes no record and a projection row with no record behind it is
lost at a rebuild. The next start turns each staged row into a reminder, retires its runtime change
and withdraws its old trigger in one transaction per row, after the seed and before the trigger
sources start. A second start finds no staged row and writes nothing.

A repo `task.yaml` that still holds a `target` line makes the seed refuse with a sentence that says
to delete the line. The web app lists reminders on its own page, where each can be cancelled.
