# The policy decision point

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md), [0004](../../decisions/0004-rule-engine.md),
  [0005](../../decisions/0005-effects-and-taint.md),
  [0006](../../decisions/0006-approval-record.md), [0008](../../decisions/0008-auto-mode.md),
  [0013](../../decisions/0013-definition-versioning.md),
  [0015](../../decisions/0015-taint-scope.md), [0023](../../decisions/0023-lifting-always-ask.md)

The policy decision point is the one function every nixie tool calls before it acts, under
[0002](../../decisions/0002-approvals.md). It takes a tool call with its context and returns allow,
ask or deny, with the stage and the rule that decided and, for an ask, the cause of the prompt. It
runs a fixed pipeline of deterministic stages, and a call that no stage settles asks the owner, or
goes to auto-mode once auto-mode is on. Every decision is a record in the
[event log](../core/event-log.md). Everything in this doc beyond the decisions it links is a
proposal, and the [rules](./rules.md), [approvals](./approvals.md) and [budgets](./budgets.md) docs
cover the parts it calls.

## The pipeline

The pipeline runs its stages in a fixed order and returns at the first stage that decides. Its last
stage always decides, so every call gets exactly one decision. The order puts every stage that can
deny or hold back an action before any stage that can allow one, so an allow never skips a check.

| Stage              | Decides                                                          | Outcome | Prompt cause         |
| ------------------ | ---------------------------------------------------------------- | ------- | -------------------- |
| 1. Registry        | The tool is unknown or has no effect declaration                 | Deny    | None                 |
| 2. Scope           | The tool is not on the caller's tool list                        | Deny    | None                 |
| 3. Deny rules      | A deny rule matches                                              | Deny    | None                 |
| 4. Always-ask set  | An effect is in the always-ask set and no lifting rule covers it | Ask     | The always-ask set   |
| 5. Destinations    | A destination has no standing permission and no consent          | Ask     | Outside steering     |
| 6. Ask rules       | An ask rule matches                                              | Ask     | The owner's ask rule |
| 7. Allow rules     | An allow rule matches                                            | Allow   | None                 |
| 8. Consent         | The owner's message asked for this action                        | Allow   | None                 |
| 9. No rule matched | Nothing above decided                                            | Ask     | No rule matched      |

The [prototype](../../../spikes/policy-rules/README.md) gave each of 108 sample calls exactly one
decision, and none changed under 200 shuffled rule orders. Rule order never matters, because within
stages 3, 6 and 7 the strictest matching outcome wins, as [rules](./rules.md#evaluation-order)
covers.

The caller's tool list in stage 2 is the job's list for a job run under
[0015](../../decisions/0015-taint-scope.md), and the subset its caller passed for a worker, so
delegation only narrows. A denied call returns the rule's ID and sentence to the model as the tool
result, so the model can take another path, and the owner never sees a prompt for it.

A queued action runs through the pipeline again before each attempt, and
[outside actions](../core/outside-actions.md#policy-before-each-attempt) sets how an approval
answers each outcome, so a rule that narrowed after the approval still applies.

## Effects

Every tool declares its effects in nixie's tool registry, under
[0005](../../decisions/0005-effects-and-taint.md), and rules match on them. The registry ships these
effects:

| Effect          | The tool                                                                         |
| --------------- | -------------------------------------------------------------------------------- |
| `read`          | Reads the owner's data or nixie's own state                                      |
| `fetch`         | Reads outside content, such as a web page or search results                      |
| `note`          | Writes inside nixie, such as a note, a memory proposal or a message to the owner |
| `write`         | Changes data in the owner's outside service that the service can restore         |
| `delete`        | Removes data in the owner's outside service for good                             |
| `send`          | Reaches a person or service other than the owner                                 |
| `spend`         | Spends money                                                                     |
| `schedule`      | Creates or changes a job                                                         |
| `run_code`      | Runs code in a sandbox with no grants                                            |
| `device`        | Acts on a physical device, such as a light or a lock                             |
| `policy_widen`  | Adds or loosens an allow rule, removes a deny or ask rule, or adds a lift        |
| `policy_narrow` | Removes or tightens an allow rule, or adds a deny or ask rule                    |
| `budget_raise`  | Raises a budget                                                                  |
| `budget_lower`  | Lowers a budget                                                                  |

A tool's effects are fixed per tool, and never depend on its arguments. A capability whose effects
differ by argument splits into tools, such as moving an email to the trash, a `write`, and purging
it, a `delete`. **Why:** a rule then reads the same for every call of a tool, and the owner reads a
tool's risk from its name. Creating a job carries the `schedule` effect plus the effects of every
tool on the job's list, so the owner's rules decide which jobs nixie schedules on its own, as 0015
requires.

A tool also declares which arguments are destinations, such as the recipients of an email or the
attendees of an invite, which argument holds an amount for a `spend`, which arguments are free-text
content, and the source of each field of its result. Effect declarations are policy data that the
owner can read and edit. Removing an effect from a declaration can take a call out of the always-ask
set or past an ask rule, so it counts as a widening; adding one only narrows.

### The always-ask set and narrowing changes

`spend`, `policy_widen` and `budget_raise` form the always-ask set from 0005. Stage 4 asks for any
call with one of them, unless a lifting rule under
[0023](../../decisions/0023-lifting-always-ask.md) covers the call and its budget has room, which
[budgets](./budgets.md#lifting-rules) covers. A deny rule can still refuse such a call at stage 3.

`policy_narrow` and `budget_lower` apply at once with a record, and the owner can undo them from the
client, as 0005 sets. The starter rule set allows them with an ordinary rule. Undoing a narrowing is
a widening, so the undo is an always-ask approval in the client.

## Destination limits

Stage 5 holds back a call that acts towards a destination with no standing permission, under
[0005](../../decisions/0005-effects-and-taint.md) and [0015](../../decisions/0015-taint-scope.md).
The conversation is always untrusted, and the first build treats every job run as untrusted too, so
stage 5 runs for every call with a destination. A destination has standing permission when it is:

- the owner, through nixie's own channels
- the reply target: the sender of a message that nixie read through a connector, which the tool
  resolves from the message ID it is given, never from text the model wrote
- a contact the owner marked as known in the client
- in the allowed destinations of the job that runs the call
- matched by the destinations of an allow rule that matches the call, such as "send email to anyone
  at example.com"

Marking a contact as known widens the limits, so only the owner does it, as a checked action in the
client; nixie can propose it, and the proposal is always-ask. A fetch from the web declares no
destination in the first build, and the outbound URL check from 0015 is a later stage.

**Consent.** The owner's own direct message can carry consent for a destination under
[0006](../../decisions/0006-approval-record.md). Consent needs 2 checks, and both must pass:

1. Code checks that every destination appears word for word in text the owner typed in the message
   that started the current turn, or that a name the owner typed matches exactly one saved contact
   with that destination. A pasted span never counts, as in
   [0011](../../decisions/0011-memory-writes.md).
2. A checker model confirms that the owner asked for this action. It sees the owner's message, with
   its pasted spans marked, and the action as structured fields, and never any tool output.

Consent satisfies stage 5 and allows a call at stage 8. It never overrides a deny rule, the
always-ask set or an owner's ask rule. A checker that refuses, is unsure, or cannot be reached
counts as no consent. Which component runs the checker is a decision for the owner below.

## Taint in the first build

The first build ships the first stage of [0015](../../decisions/0015-taint-scope.md): the
conversation and every job run are untrusted, so the destination limits apply everywhere, and no
code computes a taint label. The hooks for later stages are data:

- **Source of content.** Each tool declares the source of each result field: the owner's words, the
  owner's own data, or outside content, and the record stores it on every tool result as the
  [event log](../core/event-log.md#what-a-record-holds) sets out. The owner's own data is data the
  owner wrote, such as notes and memory with the owner's provenance. An email body, a calendar
  invite from someone else and a web page are outside content, wherever they are stored.
- **Endorsed types.** A tool's result schema marks the fields whose type nixie's policy endorses as
  clean: a boolean, a number, a date or time, an amount of money, and a value from a fixed list that
  the schema declares. A string, a URL, an address and an ID are never endorsed. The record stores
  an endorsed field as outside content with an endorsed type, so the label keeps its source, as 0015
  requires. In the first build, endorsement changes no decision.
- **Job definitions.** Each job keeps its schedule, instructions, tool list and allowed destinations
  as separate fields, and [tasks](../core/tasks.md#job-runs) covers how a run uses them.

## auto-mode

nixie runs completely without auto-mode, as [0008](../../decisions/0008-auto-mode.md) requires, and
auto-mode is off until it meets the bar that 0008 sets on nixie's scenarios. With auto-mode off,
stages 5 and 9 ask the owner. With auto-mode on, those 2 stages call auto-mode instead:

- **Stage 5** gets a deny with a reason from auto-mode, such as "write a draft instead". auto-mode
  can never allow a destination that the limits hold back, so the pipeline accepts only a deny from
  it at this stage.
- **Stage 9** gets an allow, or a deny with a reason.

The model reads a deny's reason and takes another path. A task asks the owner once auto-mode has
denied 3 calls in the same run, by default, and the owner can change the limit. The prompt then
carries the cause of the stage that called auto-mode. A timeout, an unreadable answer or a missing
verdict counts as a deny, so auto-mode fails closed. auto-mode never sees a call that stages 1 to 4,
6, 7 or 8 decided, which is how the deterministic layers stay final, and a test asserts it on every
scripted scenario.

## The decision record

Every decision becomes part of the record of the tool call it decided, in the decision field of the
[event log](../core/event-log.md#what-a-record-holds) envelope:

- the outcome and the stage
- the deciding rule's ID and revision, or none
- the prompt cause, for an ask
- the snapshot hash of the definitions in force, under
  [0013](../../decisions/0013-definition-versioning.md)
- for a stage 5 decision, each destination and the permission that covered it or its absence
- for a consent, the owner message's record and the checker's verdict
- for auto-mode, its verdict, its reason and a hash of its inputs, as 0008 requires

**Why:** a replay of the record with the snapshot it names gives the same deterministic decision,
which is the test of the principle "Policy is deterministic".

## Prompts and their causes

The target is 0 approval prompts, and every prompt records its cause under
[0005](../../decisions/0005-effects-and-taint.md). The pipeline stage gives the cause, and 2 checks
then mark the prompts that are defects:

- **A direct request.** The stage was 5 or 9, and the code half of the consent check passed, so the
  owner named the target and the checker refused or failed. The prompt records cause 1.
- **A repeat.** The stage was 5 or 9, and an earlier approval of the same tool and destinations had
  "always allow", whose rule did not match this call. The prompt records cause 2.

Otherwise the prompt records the stage's own cause: outside steering, the always-ask set, the
owner's ask rule, or no rule matched. A prompt from cause 1 or 2 is a defect, and the live view
lists every one. A prompt because no rule matched is a gap, which
[rules](./rules.md#gaps-and-proposed-rules) turns into a proposed rule.

## Scripted scenarios

The scenarios fix a sequence of tool calls, the owner's messages and the owner's answers, and run
them through the decision point with the starter rule set and auto-mode off. Each reports every
prompt with its cause and fails on a prompt the script does not expect. No model runs in them, so
they test the rules and the pipeline; the [auto-mode spike](../open-items.md#spikes-to-run) runs the
same scenarios with a model. The [prototype](../../../spikes/policy-rules/README.md) ran 13:

| Scenario                                          | Prompts | Causes                                                 |
| ------------------------------------------------- | ------- | ------------------------------------------------------ |
| Find something on the web                         | 0       |                                                        |
| Find it and send it to an address the owner typed | 0       |                                                        |
| Find it and send it to a saved contact by name    | 0       |                                                        |
| Triage an inbox as a job run, one email injected  | 1       | Outside steering, for the injected forward             |
| Book a table                                      | 1       | Outside steering: the venue came from search           |
| Buy within a lifting rule                         | 2       | The always-ask set: over the cap, budget spent         |
| A tool no rule covers, then "always allow"        | 3       | No rule matched, until the owner allowed it            |
| A tool no rule covers, then the proposed rule     | 4       | No rule matched 3 times, then the always-ask set       |
| A direct request with no rule                     | 0       |                                                        |
| Morning report job                                | 0       |                                                        |
| Grant for a day                                   | 2       | The always-ask set, then outside steering after expiry |
| Create a job that replies to email                | 1       | The owner's ask rule                                   |
| Delete for good                                   | 1       | The owner's ask rule                                   |

None of the 15 prompts came from cause 1 or 2. The booking is the case
[0014](../../decisions/0014-search.md) asks the scenarios to count: a destination that came from
search results, which the owner can clear with a rule for bookings. CI runs the scenarios on every
change to the starter rule set or the pipeline, and a model-driven run joins them once auto-mode is
tested.

## Decisions for the owner

These 6 choices are the policy design's open decisions, each with a recommendation. The rest of the
policy docs assume the recommendation.

1. **The consent checker.** Stage 8 needs a model to confirm that the owner asked for an action.
   - Options: nixie's own checker, built like the memory checker from
     [0011](../../decisions/0011-memory-writes.md) and always on; or auto-mode's own consent
     assessment, which credits consent from the owner's last message but runs only when auto-mode is
     on.
   - Recommendation: nixie's own checker. Without it, every direct request that no rule covers asks
     until auto-mode is on, and those prompts are defects by the measure in 0005.
   - Trade-off: a second checker model to build and measure, and one model call on each direct
     request that no rule covers.
2. **The cause of a prompt from the owner's own ask rule.** The 5 causes in 0005 have no place for a
   prompt that a rule the owner wrote asked for, such as "ask before deleting for good".
   - Options: record a sixth cause, the owner's ask rule, counted apart from the 0-prompt target; or
     count such prompts as no rule matched.
   - Recommendation: the sixth cause. The owner asked for these prompts, so they are neither a gap
     nor a defect, and counting them as gaps would have nixie propose rules that undo the owner's
     own.
   - Trade-off: it amends the list in 0005, and the client renders one more cause.
3. **Where the hard spending stop sits.** [Budgets](./budgets.md#the-hard-spending-stop) puts it on
   the host or with the provider, because the SDK's own cap runs inside the imp.
   - Options: a counting proxy on the host that every model request passes through, which refuses
     requests once a deployment budget is spent; a spend limit set with the model provider, where
     the provider offers one; or the runner's checks between steps alone.
   - Recommendation: the counting proxy, with a provider spend limit set as a backstop where one
     exists. The proxy enforces the owner's own budgets on the owner's host and stops a turn
     mid-way.
   - Trade-off: the proxy sits on the path of every turn and must fail closed, and it needs imp's
     broker to forward model requests through a host proxy, which a spike in
     [open items](../open-items.md#spikes-to-run) checks. The runner's checks alone let a looping
     turn overshoot.
4. **Bulk approval of always-ask items.** The [digest sheet](./approvals.md#the-digest-sheet) has an
   "approve all" action.
   - Options: "approve all" sweeps routine items only, and each always-ask or lifting item takes its
     own approval; or "approve all" sweeps every item behind one passkey check for the batch.
   - Recommendation: routine items only. A purchase or a widened rule hidden in a batch is the case
     the distinct rendering from [0023](../../decisions/0023-lifting-always-ask.md) exists to
     prevent.
   - Trade-off: a sheet with several purchases takes a tap, and later a passkey check, for each.
5. **The rule file format in the definitions repo.** The owner writes seeded rules, budgets and
   effect declarations by hand, and nixie exports runtime rules back as a pull request under
   [0020](../../decisions/0020-deployment.md).
   - Options: YAML, TOML, JSON with a schema, or TypeScript.
   - Recommendation: YAML, validated against a JSON Schema that nixie generates from the rule
     format. A list of rules with nested checks reads cleanly in it, it allows comments, and Bun
     1.4.2 parses it natively with `Bun.YAML`, which reads `no` and `on` as strings, as YAML 1.2
     does.
   - Trade-off: YAML's indentation and quoting trip hand edits, which the schema catches only at
     seed time. TOML is stricter but verbose for nested lists, JSON allows no comments, and a
     TypeScript file is code, which a seed would have to run.
6. **The starter rule set's posture.** The [starter rule set](./rules.md#the-starter-rule-set)
   decides how restrictive nixie feels on day one.
   - Options: permissive inside the always-ask set and the destination limits, as the starter set
     stands; or cautious, asking before every write to the owner's services and every send.
   - Recommendation: permissive. In the prototype, it raised 15 prompts over 13 scenarios, each one
     intended; the cautious variant raised 21, with 6 more in a single run of the inbox job, which
     would repeat on every run.
   - Trade-off: a permissive set lets a steered model label, archive, trash or draft in the owner's
     mailbox and reply to known people without asking. Each of those is restorable or within the
     destination limits, and the record shows every one.
