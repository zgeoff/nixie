# The trigger source

- Status: Proposed
- Decisions: [0001](../../decisions/0001-durable-layer.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0015](../../decisions/0015-taint-scope.md), [0016](../../decisions/0016-own-interfaces.md),
  [0020](../../decisions/0020-deployment.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

A trigger source starts work without the owner: a schedule, a poll of an outside service, or a
webhook. Each event it delivers becomes one record in the event log with the source's cursor, in the
same transaction that starts the task run or wakes the task waiting on it, so a restart resumes
without missing or repeating an event, under [0016](../../decisions/0016-own-interfaces.md). The
first build needs schedules, and it polls every outside service rather than taking pushes from it.
Everything in this doc beyond the decisions it links is a proposal.

## The interface

A source produces events and owns nothing durable itself: nixie's core stores its cursor and writes
its records. The shape below is a sketch in TypeScript.

```ts
interface TriggerSource<Cursor> {
  id: string; // stable across restarts, such as 'schedule' or 'mail:<account_id>'
  kind: 'schedule' | 'poll' | 'webhook' | 'stream';
  start(context: TriggerContext<Cursor>): Promise<void>;
  stop(): Promise<void>;
}

interface TriggerContext<Cursor> {
  cursor: Cursor | null; // the last cursor nixie committed for this source
  deliver(event: TriggerEvent<Cursor>): Promise<'delivered' | 'duplicate'>;
  reportHealth(health: SourceHealth): Promise<void>;
  signal: AbortSignal;
}

interface TriggerEvent<Cursor> {
  dedupeKey: string; // unique per source, such as a message ID or a scheduled time
  cursor: Cursor; // the cursor to commit with this event
  occurredAt: string;
  scheduledFor?: string; // set by a schedule
  target: { job: string } | { task: string; wait: string };
  payload: unknown; // outside content, encrypted like any record payload
}
```

`deliver` runs one transaction that:

1. inserts the event's dedupe key into a table keyed by source and dedupe key, and returns
   `duplicate` without writing anything else when the key exists
2. writes a `trigger_fired` record with the source, the cursor, the times and the payload
3. starts a task run for the job, or puts the record in the waiting task's inbox
4. stores the cursor on the source's row

**Why:** a source can deliver the same event twice, such as a poll that overlaps the last one or a
provider that retries a webhook, and the dedupe key turns that into one record. The cursor commits
with the record, so a crash between 2 events loses neither.

A source that reads outside content marks its payload as outside content in the record's source of
content field, and every job run starts untrusted in the first build, under
[0015](../../decisions/0015-taint-scope.md).

## Targets

An event either starts a run of a job or wakes a task that waits on it. A job run is a new task with
the job's definition pinned, as [tasks](../core/tasks.md#job-runs) describes. A waiting task, such
as one that waits for a reply to an email it sent, registers a wait with the source and a match on
the event, and the event lands in that task's inbox. **Why:** "tell me when they reply" is a task
that waits, not a new job, and the same source serves both.

## Schedules

The schedule source fires each job's schedule from the job definitions. Its cursor is the time up to
which it has handled every fire. It keeps the next fire of each job as a durable timer row from
[tasks](../core/tasks.md#waits), so a fire survives a restart like any other timer, and its dedupe
key is the job ID with the scheduled time.

On start, the source lists each job's fires between its cursor and now, and applies the catch-up
rule from [0027](../../decisions/0027-tasks-and-outside-actions.md): one catch-up run when the
latest missed fire is within half the job's interval, and otherwise a skip that it reports. Each
skip is a record, which the dashboard shows.

Schedules run in the owner's time zone, a deployment setting. A wall-clock time that a daylight
saving change skips fires at the first minute after the gap, and a time that the change repeats
fires once, at its first occurrence. **Why:** a morning report must run once on the day the clocks
change, not twice or never.

A changed job definition reaches the schedule at once, under
[0013](../../decisions/0013-definition-versioning.md), and a run already started keeps the version
it pinned. The format the owner writes schedules in belongs to the definitions, and the source needs
only the next fire after a given time.

## Polls

A poll source asks an outside service for what changed since its cursor, on an interval. The
connector for the service supplies the call, and the cursor is the service's own:

| Service         | Cursor                                     |
| --------------- | ------------------------------------------ |
| Gmail           | The history ID from the last poll          |
| IMAP            | The folder's `UIDVALIDITY` and highest UID |
| CalDAV          | The collection's sync token                |
| Google Calendar | The sync token from the last list          |

A poll runs every 5 min by default, and the owner can set another interval per source. A job can
filter events with a check that runs in code before any model, such as "from these senders" or "with
this label", so a poll that finds nothing the job wants starts no task. That check is the cheap
periodic check the scope asks for in tier 2.

A failing poll backs off: 1 min, then doubling up to 1 h, with the provider's retry time honoured
when it gives one. After 3 failures in a row, the source reports itself unhealthy, which writes a
record and puts a row on the dashboard. A cursor the service rejects as too old, such as an expired
Gmail history ID, makes the source resync from a fresh cursor and report that it may have missed
events in the gap.

## Webhooks

A webhook source takes events that a service posts to nixie, and needs a route from the internet to
nixie's host. Each webhook has its own path and secret. The source checks the service's signature
and refuses a request older than 5 min, and it answers success only after `deliver` commits, so the
service retries anything nixie did not record.

Webhooks are off by default, and each one is a deployment choice under
[0020](../../decisions/0020-deployment.md), because an inbound route is part of how the owner
exposes the host.

## Which services need push

None in the first build. A poll every 5 min covers mail triage, calendar changes and the jobs in the
overview, and needs no inbound route and no third-party relay. Gmail's push goes through Google
Cloud Pub/Sub, and Google states its notifications may be delayed or dropped, so a poll is needed
alongside it anyway.

A job that must react within seconds gets push through a `stream` source, which holds an outbound
connection open, such as IMAP `IDLE`. A stream needs no inbound route, reconnects with the same
back-off as a poll, and runs a poll on reconnect to cover the time it was down. A webhook stays for
services that offer nothing else.

## Room for the other interfaces

[0016](../../decisions/0016-own-interfaces.md) asks that the trigger source leave room for the
connector, the credential store and the definitions source:

- **The connector** supplies a poll source's call and cursor, and a stream source's connection, as
  typed calls with declared effects. A poll is a read, so it runs under the connector's read effect.
- **The credential store** gives the connector its token for each poll. The source never sees a
  credential, and a refresh happens in the store, not in the source.
- **The definitions source** supplies the schedules and each job's filter. A seeded change to a
  schedule reaches the schedule source the same way a change in the client does, under
  [0020](../../decisions/0020-deployment.md).
