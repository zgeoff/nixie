# The trigger source

- Decisions: [0005](../../../decisions/0005-untrusted-conversation.md)

A trigger source starts work without you: a schedule, a poll, a held stream or a webhook. A batch of
events commits in one transaction with the source's cursor and the fire and skip records and task
wake-ups it causes, so a restart neither misses nor repeats an event. The first build has schedules
and polls.

## The interface

A source produces events and owns nothing durable; nixie's core stores its cursor.

```ts
interface TriggerSource {
  // stable across restarts, such as 'schedule'
  readonly id: string;
  readonly kind: 'schedule'; // 'poll', 'webhook' and 'stream' arrive with their sources

  // resolves once the source runs
  readonly start: (context: TriggerContext) => Promise<void>;

  // resolves once no tick is in flight
  readonly stop: () => Promise<void>;
}

interface TriggerContext {
  // the last cursor nixie committed for this source; null for the schedule source
  readonly cursor: JSONValue;
  readonly deliver: (batch: TriggerBatch) => Promise<{ readonly delivered: number }>;

  // held in memory by startTriggerSources
  readonly reportHealth: (health: SourceHealth) => void;

  // aborted at stop
  readonly signal: AbortSignal;
}

interface TriggerBatch {
  readonly cursor: JSONValue;
  readonly events: readonly TriggerEvent[];
}

type SourceHealth = 'running' | 'unhealthy' | 'stopped';

interface TriggerEvent {
  readonly definitionID: string;

  // the version the source computed the event from
  readonly definitionHash: string;
  readonly kind: 'schedule' | 'at';
  readonly dedupeKey: string;

  // ISO instant: the newest slot the event covers
  readonly scheduledFor: string;

  // ISO instant the source built the event
  readonly occurredAt: string;

  // earlier slots never delivered, ISO, oldest first: the 20 newest
  readonly missed: readonly string[];

  // the full number of earlier missed slots
  readonly missedCount: number;

  // set when the source decides a skip
  readonly skip?: 'too_late' | 'catch_up_off' | 'window_closed';

  // a poll source sets outside content here
  readonly payload: null;
}
```

`deliver` is one write transaction, and each event names its definition. It drops an event whose
dedupe key is taken, and an event whose definition is not armed on this source at the event's hash.
It writes `trigger.fired` or `trigger.skipped` for each other event. A fire wakes the definition's
task, or lands on the conversation's thread for `target: conversation`. A skip records the source's
reason, or `still_running` or `task_held` from the task. It stores the cursor only when the cursor
changes. **Why:** a sync token covers a set of changes, so it commits only with every event it
covers. The match of a polled event to a definition or a wait arrives with
[the Gmail and Calendar polls](https://linear.app/zgeoff/issue/GEO-1827). Every task run of a
definition starts untrusted in the first build.
[The architecture doc](../../../architecture/core/triggers.md#one-deliver-call) holds the full
table.

## Schedules

The schedule source fires the `schedule` and `at` triggers of each armed task definition. It ticks
at start and then every 20 s. nixie stores no timer: each tick computes the next fire from the
definition's watermark, so a zone change or an edited trigger moves the next fire at once.

The dedupe key of a `day` or `week` fire is `<definitionID>|<local date>T<HH:MM>`, which holds the
local slot. The key of an `hour`, minutes or `at` fire is `<definitionID>|<UTC instant>`.

After any late tick, a restart included, a fire more than 60 s late is a catch-up:

- With `catchUp: once`, the source fires once when the newest missed slot is within half the
  interval, and otherwise skips with `too_late`.
- With `catchUp: skip`, it skips with `catch_up_off`.
- A window with `idleMinutes` fires once you have been idle that long inside the window, and skips
  with `window_closed` when the window ends first.
- A window without `idleMinutes` fires at any tick inside the window, and past it takes the catch-up
  rules, measured from `window.from`.

An `at` trigger fires once, however late. Schedules run in your time zone: a time that daylight
saving skips fires just after the gap, and a repeated time fires once. A changed task definition
reaches its schedule at once, and a started task run of a definition keeps its pinned version.
[The architecture doc](../../../architecture/core/triggers.md#the-schedule-source) holds the full
decision table.

## Polls

A poll asks an outside service what changed since its cursor, every 5 min by default. The connector
supplies the call and the service's own cursor:

| Service         | Cursor                                     |
| --------------- | ------------------------------------------ |
| Gmail           | The history ID from the last poll          |
| IMAP            | The folder's `UIDVALIDITY` and highest UID |
| CalDAV          | The collection's sync token                |
| Google Calendar | The sync token from the last list          |

A task definition's filter in code, such as "from these senders", runs before any model, so a poll
that finds nothing wanted costs no model call. A failing poll backs off from 1 min to 1 h and
reports itself unhealthy after 3 failures. A cursor the service rejects makes the source resync and
record the possible gap.

## Webhooks and streams

The first build takes no push from any service: a 5-minute poll covers mail and calendar with no
inbound route. A task definition that must react in seconds uses a `stream` source, such as IMAP
`IDLE`, which holds an outbound connection and polls on reconnect. A webhook is a deployment choice,
off by default: it checks the service's signature, refuses requests older than 5 min, and answers
success only after `deliver` commits.

The connector supplies each poll's call and runs it under its read effect, the credential store
gives the connector its token, and the definitions source supplies schedules and task definition
filters. A source never sees a credential.
