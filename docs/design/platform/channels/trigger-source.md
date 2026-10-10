# The trigger source

- Decisions: [0016](../../../decisions/0016-own-interfaces.md),
  [0013](../../../decisions/0013-definition-versioning.md),
  [0015](../../../decisions/0015-taint-scope.md),
  [0027](../../../decisions/0027-tasks-and-actions.md)

A trigger source starts work without you: a schedule, a poll, a held stream or a webhook. A batch of
events commits in one transaction with the source's cursor and the job runs and task wake-ups it
causes, so a restart neither misses nor repeats an event. The first build has schedules and polls.

## The interface

A source produces events and owns nothing durable; nixie's core stores its cursor.

```ts
interface TriggerSource<Cursor> {
  id: string; // stable across restarts, such as 'schedule' or 'mail:<account_id>'
  kind: 'schedule' | 'poll' | 'webhook' | 'stream';
  start(context: TriggerContext<Cursor>): Promise<void>;
  stop(): Promise<void>;
}

interface TriggerContext<Cursor> {
  cursor: Cursor | null; // the last cursor nixie committed for this source
  deliver(batch: { cursor: Cursor; events: TriggerEvent[] }): Promise<{ delivered: number }>;
  reportHealth(health: SourceHealth): Promise<void>;
  signal: AbortSignal;
}

interface TriggerEvent {
  dedupeKey: string; // unique per source, such as a message ID or a scheduled time
  occurredAt: string;
  scheduledFor?: string; // set by a schedule
  payload: unknown; // outside content, encrypted like any record payload
}
```

`deliver` skips events whose dedupe key it has seen, writes a record per new event, starts a job run
for each matching job filter, delivers the record to each task with a matching wait, and stores the
cursor. **Why:** a sync token covers a set of changes, so it commits only with every event it
covers. The core matches events against filters and waits, so one email can start a job run and wake
a task that waits for a reply. Every job run starts untrusted in the first build.

## Schedules

The schedule source fires each job's schedule from the definitions, with each next fire as a durable
timer and the job ID plus the scheduled time as the dedupe key. After a restart, it runs one
catch-up job run when the latest missed fire is within half the job's interval, and otherwise
records a skip, under [0027](../../../decisions/0027-tasks-and-actions.md). Schedules run in your
time zone: a time that daylight saving skips fires just after the gap, and a repeated time fires
once. A changed job reaches its schedule at once, and a started job run keeps its pinned version.

## Polls

A poll asks an outside service what changed since its cursor, every 5 min by default. The connector
supplies the call and the service's own cursor:

| Service         | Cursor                                     |
| --------------- | ------------------------------------------ |
| Gmail           | The history ID from the last poll          |
| IMAP            | The folder's `UIDVALIDITY` and highest UID |
| CalDAV          | The collection's sync token                |
| Google Calendar | The sync token from the last list          |

A job filter in code, such as "from these senders", runs before any model, so a poll that finds
nothing wanted costs no model call. A failing poll backs off from 1 min to 1 h and reports itself
unhealthy after 3 failures. A cursor the service rejects makes the source resync and record the
possible gap.

## Webhooks and streams

The first build takes no push from any service: a 5-minute poll covers mail and calendar with no
inbound route. A job that must react in seconds uses a `stream` source, such as IMAP `IDLE`, which
holds an outbound connection and polls on reconnect. A webhook is a deployment choice, off by
default: it checks the service's signature, refuses requests older than 5 min, and answers success
only after `deliver` commits.

The connector supplies each poll's call and runs it under its read effect, the credential store
gives the connector its token, and the definitions source supplies schedules and job filters. A
source never sees a credential.
