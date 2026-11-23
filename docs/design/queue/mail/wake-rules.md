# Wake rules and arrivals

- **Status:** draft
- **Work items:** [the mail polls](https://linear.app/zgeoff/issue/GEO-1827)

The triggers module holds the wake rules and the one arrival path that both mail products share.
Each mail source hands its new mail to the [trigger core](../../../architecture/core/triggers.md) as
arrivals. The core matches each arrival against the rules of its mailbox, and either wakes the
rule's task at once or holds the match for one later wake. See the [README](README.md) for the
terms. Read this part to build the triggers module's half of the mail polls item. Build and test it
against a fake mail source, so it waits on neither mailbox.

## Shape

```mermaid
flowchart LR
  src[a mail source] -->|"deliver"| match{a rule matches?}
  match -->|"no"| none[nothing written]
  match -->|"yes"| arrived[trigger.mail_arrived]
  arrived -->|"rule and task ready"| woke[trigger.mail_woke]
  arrived -->|"not ready"| held[(wake_held)]
  held -->|"flush every 20 s"| woke
  woke --> inbox[the task's inbox]
```

## Contracts

### The rules

```ts
// triggers module. The mail and connectors modules call these from their tools and sends.
const rule = await setWakeRuleInTransaction(tx, {
  mailbox: { kind: 'mail' },
  match: { from: ['@library.example.org'], subject: 'code' },
  taskID,
  expiresAt: 1795943100000,
  windowMs: 900000,
  origin: 'tool',
});
// → { ruleID: '7c1e…', shortID: 'wq4k8m2x7p', createdAt: 1795941300000, replaced: false, …input }
await endWakeRuleInTransaction(tx, rule.ruleID, 'cancelled');
const rules = await readWakeRules(tx, { mailbox, taskID }); // rules not expired or ended, newest first
```

```ts
interface WakeRuleInput {
  mailbox: Mailbox;
  match: WakeMatch;
  taskID: string; // the task that called the tool or ran the send
  expiresAt: number; // epoch ms
  windowMs: number;
  origin: 'tool' | 'reply'; // 'reply': registered by a send
}

type Mailbox = { kind: 'mail' } | { kind: 'gmail'; connectionID: string }; // connection UUID
// mailboxKey(mailbox): 'mail' or 'gmail:<connectionID>', the one text form tables store

// Every field is optional, and every field present must match. An empty match takes every arrival.
interface WakeMatch {
  from?: string[]; // addresses, or '@domain' for that domain and never a subdomain; without case
  subject?: string; // a substring, both sides in NFC and lowered
  thread?: string; // the mailbox's thread ID: a short ID for 'mail', Gmail's thread ID for 'gmail'
}

interface WakeRule extends WakeRuleInput {
  ruleID: string; // crypto.randomUUID()
  shortID: string; // createShortID; the one ID the model reads and passes
  createdAt: number; // epoch ms: the commit of the transaction that set the rule
}

type WakeRuleEndReason = 'cancelled' | 'task_ended' | 'connection_forgotten';
```

```text
trigger.wake_rule_set     -- the whole rule; a replace writes it again under the same ruleID
trigger.wake_rule_ended   -- ruleID, reason, released: the held arrivals it drops, by sequence;
                             empty for 'cancelled', whose held matches still flush
wake_rules                -- projection: one row per rule, with ended_at and reason
```

- Setting a rule with the same mailbox, match and task as a live rule replaces that rule in place.
  The rule keeps its ID, short ID, `createdAt` and the time of its last wake, and takes the new
  expiry and window length. The result holds `replaced: true`.
- The core writes no record when a rule expires. A rule matches no mail received at or after
  `expiresAt`.
- `readWakeRules`, which the list tools call, leaves out a rule that expired, ended, or belongs to a
  task that ended.
- A rule's match is stored in plain text, as a definition's filter is.
- The conversation may hold a wake rule, and its sends register reply rules, until the owner decides
  otherwise in [GEO-2831](https://linear.app/zgeoff/issue/GEO-2831).

### The arrival event

```ts
// triggers module. The schedule event keeps its shape as ScheduleEvent, and
// TriggerEvent = ScheduleEvent | MailArrivalEvent, discriminated on kind; TriggerBatch.events
// takes the union.
interface MailArrivalEvent {
  kind: 'mail';
  mailbox: Mailbox; // the core refuses an event whose mailbox doesn't belong to its source
  dedupeKey: string; // the source's part: '<hostMessageID>' for 'mail', '<connectionID>|<messageID>'
  //                    for 'gmail'; buildSourceKey adds the source ID, as for a schedule event
  occurredAt: string; // ISO: when the source read it
  payload: MailArrival;
}

interface MailArrival {
  messageID: string; // the short ID for 'mail'; Gmail's message ID for 'gmail'
  threadID: string; // as WakeMatch.thread
  receivedAt: number; // epoch ms, the host's receive time, such as Gmail's internalDate
  from: string; // the From address alone, lowered
  subject: string;
}

// …existing fields of TriggerSource
kind: 'schedule' | 'mail'; // both mail sources: id 'mail' for the assistant's, 'gmail' for Gmail
```

`deliverTriggerBatch` dispatches on the event's `kind`. A schedule event takes the steps of
[one deliver call](../../../architecture/core/triggers.md#one-deliver-call) as today. A mail event
takes these, in the same write transaction:

1. When `trigger_keys` holds the event's key, the core skips the event.
2. The core finds each rule of the event's mailbox that has not ended and matches, with `createdAt`
   at or before `receivedAt`, and `receivedAt` before `expiresAt`.
3. For each matching rule whose task has ended, the core ends the rule as `task_ended` and drops it.
   When no rule is left, the core writes no arrival record and claims no key.
4. The core writes one `trigger.mail_arrived`. Its fold adds the key to `trigger_keys`, as the folds
   of `trigger.fired` and `trigger.skipped` do. The record holds each matching rule, and whether its
   task woke now or the match was held.
5. When the mailbox is ready, the core writes one `trigger.mail_woke` for each task with a ready
   matching rule, through the [inbox](../../../architecture/core/tasks.md#the-inbox) writer. The
   record holds every matching rule of that task. The core wakes the task with the cause `event`, at
   [hop](../../../architecture/core/task-messages.md#the-hop-limit) 0.
6. The core holds every other match in `wake_held`.

### Windows, the throttle and the flush

A wake starts a window for each rule in it. The wakes of one arrival or one flush start one throttle
for their mailbox. While a window or the throttle runs, a match waits. A rule or a mailbox is ready
once its wait is over:

- a rule is ready when its last wake was `windowMs` or more ago, or it never woke;
- a mailbox is ready when its last wake, to any task, was `wake_rules.throttle` or more ago, or it
  never had one.

So the throttle can hold back a new rule's first match for up to `wake_rules.throttle` when another
rule on the same mailbox has just woken a task. The flush runs every 20 seconds, in one write
transaction per tick:

1. It finds each held match whose mailbox is ready and that has at least one ready rule.
2. When the match's task has ended, it ends each of the task's rules as `task_ended`, with the
   task's held matches in `released`.
3. Otherwise it writes one `trigger.mail_woke` per task, with every such match of that task, oldest
   first.

```text
wake_rule_windows   -- rule_id, last_wake_at: the recorded time of the rule's last wake
wake_throttles      -- mailbox_key, last_wake_at
wake_held           -- rule_id, task_id, arrived_seq: the trigger.mail_arrived record's sequence
                    -- all 3: triggers module, projections of trigger.mail_arrived, trigger.mail_woke
                    -- and trigger.wake_rule_ended, so a rebuild restores every held match
```

### The wake

```ts
// trigger.mail_woke: an inbox kind beside trigger.fired, with its codec where trigger.fired's is.
// It carries what the render needs, so the render reads no other record.
interface MailWoke {
  taskID: string;
  mailbox: string; // mailboxKey
  rules: { ruleID: string; shortID: string; match: WakeMatch; expiresAt: number }[];
  mails: {
    arrived: number; // the sequence of its trigger.mail_arrived; the folds clear it from wake_held
    messageID: string;
    threadID: string;
    receivedAt: number;
    from: string;
    subject: string;
  }[];
  // oldest first; from and subject sit in the record's erasable fields
}
```

The step renders a wake as outside content, in the block that system messages use:

```text
<system-message type="mail" id="…" at="…">
Wake rule wq4k8m2x7p (mail from @library.example.org, subject "code", until 10:45): 2 new mails.
<untrusted id="…">from hello@library.example.org: Your code</untrusted> (message mz4k8q2w7p)
<untrusted id="…">from hello@library.example.org: Your new code</untrusted> (message mb2x9k4q8w)
</system-message>
```

### Erasure

- `trigger.mail_arrived` holds `from` and `subject` in its erasable fields, and the core deletes its
  erasure key once no held match names it: when the last wake or release that needs it commits. So a
  mail's text lasts in nixie's records only in the wakes that showed it.
- `trigger.mail_woke` sits on its task's thread with `from` and `subject` erasable, so you forget it
  as you forget any record, and the forget takes the mail's text with it.
- A wake whose fields are erased renders each mail as forgotten.
- Forgetting a Google connection ends its rules as `connection_forgotten`, and erases the fields of
  its wakes and its held arrivals. That waits on the
  [erasure design](https://github.com/zgeoff/nixie/pull/1413), which runs it as a child of the
  connection's credential.

### Settings

The triggers module owns the `wake_rules` section of the deployment config. Its values are durations
in the shared text form.

```yaml
wake_rules:
  window: 15m # a rule's window when the tool gives none
  throttle: 5m # the throttle of each mailbox
  max_expiry: 30d # the longest expiry a rule takes
  reply_expiry: 7d # the expiry of the rule a send registers
```

## Constraints

- Nothing wakes the assistant on mail unless a wake rule matched that mail.
- While its task lives, every match wakes the task, at once or in a later flush. Once the task has
  ended, the core records no new match for it, and lists each of its held matches in `released`. The
  mail itself stays in its mailbox.
- A rule that has not ended matches mail received from its `createdAt` up to its `expiresAt`, both
  by the host's receive time, even when that mail is delivered after `expiresAt`.
- A cancelled rule matches nothing more. Its held matches still flush, because each matched while
  the rule stood.
- A match with a ready rule on a ready mailbox wakes its task in the transaction that delivers it. A
  held match wakes its task within 20 seconds of its mailbox and one of its rules becoming ready.
- The core wakes tasks from one mailbox at most once per throttle, however much mail arrives: in one
  arrival or one flush, which wakes each of its tasks once. A wake happens only when at least one of
  the wake's rules is ready, and a rule that is not ready joins that wake without causing it.
- One arrival gives each task at most one wake, however many of its rules match.
- The core never reads the [task gate](../task-gate.md) for an arrival or a flush. While a task is
  held, its wakes land in its inbox and wait there, as the gate design says for poll sources.
- The core and the flush check that a task has not ended before they call the inbox writer for it.
- The core matches on the values the source just read from the host, never on erasable fields read
  back.
- The From header proves nothing about the sender. A `from` match is a filter, never a trust check.
- The mail module and the connectors module reach wake rules only through the triggers module, and
  never import each other.

## Builder decides

- Whether the flush runs on the [`startSweep` helper](https://linear.app/zgeoff/issue/GEO-2827) or
  on a loop of its own until that helper lands.
- How the flush and a deliver share the one writer when both fall due in the same tick.
- How a replace compares two matches, and the indexes of the 4 tables.
- The wording of the wake's line, and the zone its times show in.
