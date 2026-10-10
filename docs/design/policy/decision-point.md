# The decision point

- Decisions: [0002](../../decisions/0002-approvals.md), [0004](../../decisions/0004-rule-engine.md),
  [0005](../../decisions/0005-effects-and-taint.md),
  [0006](../../decisions/0006-approval-record.md), [0008](../../decisions/0008-auto-mode.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0015](../../decisions/0015-taint-scope.md), [0023](../../decisions/0023-lifting-always-ask.md),
  [0028](../../decisions/0028-policy-design.md)

The decision point is the one function every nixie tool calls before it acts. It takes a tool call
with its context and returns allow, ask or deny, with the stage and rule that decided and, for an
ask, the prompt cause. It runs a fixed pipeline of deterministic stages, and a call that no stage
settles asks you, or goes to auto-mode once auto-mode is on. Every decision is part of a record in
the [event log](../core/event-log.md).

## The pipeline

The stages run in a fixed order, and the first stage that decides returns. Every stage that can deny
or hold back a call runs before any stage that can allow one, so an allow never skips a check. The
last stage always decides, so every call gets exactly one decision.

| Stage              | Decides                                                          | Outcome | Prompt cause       |
| ------------------ | ---------------------------------------------------------------- | ------- | ------------------ |
| 1. Registry        | The tool is unknown or has no effect declaration                 | Deny    | None               |
| 2. Scope           | The tool is not on the caller's tool list                        | Deny    | None               |
| 3. Deny rules      | A deny rule matches                                              | Deny    | None               |
| 4. Always-ask set  | An effect is in the always-ask set and no lifting rule covers it | Ask     | The always-ask set |
| 5. Destinations    | A destination has no standing permission and no consent          | Ask     | Outside steering   |
| 6. Ask rules       | An ask rule matches                                              | Ask     | Your ask rule      |
| 7. Allow rules     | An allow rule matches                                            | Allow   | None               |
| 8. Consent         | Your own message asked for this call                             | Allow   | None               |
| 9. No rule matched | Nothing above decided                                            | Ask     | No rule matched    |

Within stages 3, 6 and 7 the strictest matching outcome wins, so rule order never matters, as
[rules](./rules.md#evaluation-order) covers.

The caller's tool list at stage 2 is the job's list for a job run, and the subset its caller passed
for a worker, so delegation only narrows. A denied call returns the rule's ID and sentence to the
model as the tool result, so the model can take another path, and no prompt reaches you. A queued
action runs through the pipeline again before each attempt, so a rule that narrowed after its
approval still applies; [actions](../core/outside-actions.md) covers how an approval answers each
outcome.

## Effects

Every tool declares its effects in nixie's tool registry, and rules match on them:

| Effect          | The tool                                                                   |
| --------------- | -------------------------------------------------------------------------- |
| `read`          | Reads your data or nixie's own state                                       |
| `fetch`         | Reads outside content, such as a web page or search results                |
| `note`          | Writes inside nixie, such as a note, a memory proposal or a message to you |
| `write`         | Changes data in your outside service that the service can restore          |
| `delete`        | Removes data in your outside service for good                              |
| `send`          | Reaches a person or service other than you                                 |
| `spend`         | Spends money                                                               |
| `schedule`      | Creates or changes a job                                                   |
| `run_code`      | Runs code in the caller's sandbox under its recorded grant boundary        |
| `device`        | Acts on a physical device, such as a light or a lock                       |
| `policy_widen`  | Adds or loosens an allow rule, removes a deny or ask rule, or adds a lift  |
| `policy_narrow` | Removes or tightens an allow rule, or adds a deny or ask rule              |
| `budget_raise`  | Raises a budget                                                            |
| `budget_lower`  | Lowers a budget                                                            |
| `export`        | Writes decrypted personal data out of nixie to a place you pick            |

A tool's effects are fixed per tool and never depend on its arguments. A capability whose effects
differ by argument splits into tools: moving an email to the trash is a `write`, and purging it is a
`delete`. **Why:** a rule then reads the same for every call of a tool, and the tool's name tells
you its risk. Creating a job carries `schedule` plus the effects of every tool on the job's list, so
your rules decide which jobs nixie schedules on its own.

A tool also declares which arguments are destinations, which argument holds the amount for a
`spend`, which arguments are free-text content, and the source of each field of its result. Effect
declarations are policy data that you can read and edit. Removing an effect from a declaration
counts as a widening, because it can move a call out of the always-ask set or past an ask rule.

A `run_code` call from the conversation or an ordinary task gets a fresh sandbox with no grants. In
a worker, it runs in the worker's own sandbox, whose one grant is the model-API credential. The
sandbox adapter records the actual placement and grants, and the resolved execution profile is part
of the action hash. Model requests from worker code pass through the counting proxy on the host and
count against the same budgets, so `run_code` never bypasses the spending limits.

### The always-ask set and narrowing changes

`spend`, `policy_widen` and `budget_raise` form the always-ask set. Stage 4 asks for any call with
one of them unless a lifting rule covers the call and its budget has room, as
[budgets](./budgets.md#lifting-rules) covers. A deny rule can still refuse such a call at stage 3.

`policy_narrow` and `budget_lower` apply at once, with a record and an undo in the client. Undoing a
narrowing is a widening, so the undo is an always-ask approval.

## Destination limits

Stage 5 holds back a call that acts towards a destination with no standing permission. The
conversation is always untrusted, and the first build treats every job run as untrusted too, so
stage 5 runs for every call with a destination. A destination has standing permission when it is:

- you, through nixie's own channels
- the reply target: the sender of a message that nixie read through a connector, which the tool
  resolves from the message ID, never from text the model wrote
- a contact you marked as known in the client
- in the allowed destinations of the job that runs the call
- matched by the destinations of an allow rule that matches the call

Marking a contact as known widens the limits, so it is a checked action that only you take. nixie
can propose it, and the proposal is always-ask. A web fetch declares no destination in the first
build.

### Consent

Your own direct message can carry consent for a call. Consent needs 2 checks, and both must pass:

1. Code checks that every destination appears word for word in text you typed in the message that
   started the current turn, or that a name you typed matches exactly one saved contact with that
   destination. A pasted span never counts.
2. The consent checker, a checker model that nixie runs always, confirms that you asked for this
   call. It sees your message with its pasted spans marked and the call as structured fields, never
   any tool output, so injected content cannot reach it.

A call with no destination, such as turning on a light, rests on the checker alone. Consent
satisfies stage 5 and allows a call at stage 8. It never overrides a deny rule, the always-ask set
or your ask rule. A checker that refuses, is unsure or cannot be reached counts as no consent.

## Taint in the first build

The first build treats the conversation and every job run as untrusted, so the destination limits
apply everywhere and no code computes a taint label. 3 hooks are data from the start, for the later
stages that [0015](../../decisions/0015-taint-scope.md) sets:

- **Source of content.** Each tool declares the source of each result field: your words, your own
  data, or outside content. The record stores it on every tool result. An email body, an invite from
  someone else and a web page are outside content wherever they are stored.
- **Endorsed types.** A result schema marks the fields whose type policy endorses as clean: a
  boolean, a number, a date or time, an amount of money, and a value from a fixed list. A string, a
  URL, an address and an ID are never endorsed. An endorsed field keeps outside content as its
  source. In the first build, endorsement changes no decision.
- **Job definitions.** Each job keeps its schedule, instructions, tool list and allowed destinations
  as separate fields, which [tasks](../core/tasks.md) uses for a job run.

## auto-mode

nixie runs completely without auto-mode, and auto-mode stays off until it meets the bar that
[0008](../../decisions/0008-auto-mode.md) sets on nixie's scenarios. With auto-mode on, stages 5 and
9 call auto-mode instead of asking:

- **Stage 5** accepts only a deny with a reason, such as "write a draft instead". auto-mode never
  allows a destination that the limits hold back.
- **Stage 9** accepts an allow, or a deny with a reason.

The model reads a deny's reason and takes another path. Once auto-mode denies 3 calls in the same
task run, a default you can change, the task asks you, with the cause of the stage that called
auto-mode. A timeout, an unreadable answer or a missing verdict counts as a deny, so auto-mode fails
closed. auto-mode never sees a call that any other stage decided, and a test asserts it on every
scripted scenario.

## The decision record

Every decision becomes part of the record of the tool call it decided:

- the outcome and the stage
- the deciding rule's ID and revision, or none
- the prompt cause, for an ask
- the snapshot hash of the definitions in force, as [rules](./rules.md#the-snapshot-hash) defines
- for stage 5, each destination and the permission that covered it, or its absence
- for consent, the record of your message and the checker's verdict
- for auto-mode, its verdict, its reason and a hash of its inputs

**Why:** a replay of the record with the snapshot it names gives the same deterministic decision,
which is the test of the principle "Policy is deterministic".

## Prompt causes

The target is 0 approval prompts, and every prompt records its cause. The stage gives the cause, and
2 checks then mark the prompts that are defects:

- **A direct request.** The stage was 5 or 9, and the code half of the consent check passed, so you
  named the target and the checker refused or failed.
- **A repeat.** The stage was 5 or 9, and an earlier approval of the same tool and destinations had
  "always allow", whose rule did not match this call.

Otherwise the prompt records its stage's cause: outside steering, the always-ask set, your ask rule,
or no rule matched. A direct request or a repeat is a defect, and the live view lists each one. A
prompt from your ask rule is one you asked for, so it sits outside the 0-prompt count, and the
scenario report lists those prompts apart. A prompt because no rule matched is a gap, which
[rules](./rules.md#gaps-and-proposed-rules) turns into a proposed rule.

The scripted scenarios in the [policy rules spike](../../../spikes/policy-rules/) run fixed calls,
messages and answers through the decision point with the starter rule set and auto-mode off, and
fail on any prompt the script does not expect. CI runs them on every change to the starter rule set
or the pipeline.
