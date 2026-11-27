# The decision point

The decision point answers allow, ask or deny for each tool call before the call acts. It decides
from what the tool declares it does, the rules in force, who the call sends to, and whether you
asked for it. The record of the call keeps the decision beside the snapshot hash of the definitions
in force, and a replay rebuilds the decision from that record. The one call that gets no decision is
a call to a listed tool whose input breaks the tool's input schema: the
[tool endpoint](../connectors/tool-calls.md#the-call-steps) checks the input first and rejects it,
so it never reaches the decision point. `modules/policy` owns the decision point and the effect
declarations. [Tool calls](../connectors/tool-calls.md) covers how a call reaches it, and the
[decision point design](../../design/platform/policy/decision-point.md) covers what is still to
build.

## The stages

The stages run in order, and the first that decides returns. Each call reads one snapshot: the rules
in force, the known contact IDs and the tool declarations of the snapshot the call runs under, never
the latest.

| Stage          | Decides when                                                  | Outcome |
| -------------- | ------------------------------------------------------------- | ------- |
| 1. Registry    | The registry holds no declaration for the tool, or no effect  | Deny    |
| 2. Scope       | The tool is missing from the caller's tool list               | Deny    |
| 3. Deny rules  | A deny rule matches                                           | Deny    |
| 4. Always ask  | The tool spends, widens the policy or raises a budget         | Ask     |
| 5. Destination | A destination has no permission and no consent covers it      | Ask     |
| 6. Ask rules   | An ask rule matches                                           | Ask     |
| 7. Allow rules | An allow rule matches                                         | Allow   |
| 8. Consent     | You asked for the call in typed words, and the checker agrees | Allow   |
| 9. No rule     | Always, because nothing else decided                          | Ask     |

A call that declares `memory_write` skips the checker of stage 8 and the ask of stage 9: it gets the
outcome `gate` at stage 8, as [memory writes](#memory-writes) says. `memory.retopic` is the
exception that asks at stage 9.

The caller's tool list is the run's own: the task definition's list for a task run of a definition,
and the subset its caller passed for a worker. A tool that the registry knows but the run was not
given is therefore denied, even though the model can name it.

A rule's effects are the tool's declared effects, so the same tool gets the same answer under the
same rules unless a rule also names argument checks, a context, a source of content or a `cel`
condition. At stages 3, 6 and 7, a rule's condition evaluates only after its other fields match. A
condition that errors makes a deny rule ask with the cause `condition_error`, makes an ask rule
catch the call, and makes an allow rule cover nothing, as
[rule conditions](rule-conditions.md#evaluating-a-condition) describes. When several rules of one
outcome match, the first by rule ID decides, and the decision names the others.

## Memory writes

A call to a tool that declares `memory_write` never reaches the consent check at stage 8 or the "no
rule" ask at stage 9. When no rule decided it at stages 3 to 7, stage 8 gives the outcome `gate`,
with no rule and no cause. The memory gate then decides the write. The log stores `gate` as it
stores any outcome, so the record shows that no rule decided the write. The one exception is
`memory.retopic`: with no deciding rule it skips the memory gate and the checker, and asks at stage
9 with the cause `no_rule`, so the call waits as an action proposal. A call that moves into or out
of self ignores each allow rule that checks no `subject`, so it waits too.

Before the decision, the tool sets the call's sources and arguments, because the model's words and
the step's own sources would misstate them:

- The sources come from the quote that the content gate finds: `owner` for a quote in text you typed
  in the thread's recent messages, outside any pasted span. A write with no quote, a quote in a
  pasted span, a photo, a self-note or a quote the gate cannot place takes `outside`. A write from a
  task run adds `task`. A memory write never takes `own_data`.
- `memory.edit` and `memory.retire` take `subject` from the item when the call leaves it out, and
  `memory.pin` takes it from the item, so a rule reads `subject` on all 4 tools. A pin takes the
  source `task` from a task run and no other source.

The tool runner passes the decision to the tool as a verdict: the allow rules that matched with
their checks, the ask rule, or `gate`. The tool trusts a rule verdict only when the declaration that
the decision point read holds `memory_write`. A snapshot declaration from before the release that
changed it still says `note`, and a call decided from it runs every check of the memory gate. A
snapshot from before `memory.pin` declared `memory_write` gives a pin no verdict, so the pin stays a
proposal.

## Destinations

Stage 5 gives each destination of a call the first permission that holds:

1. `owner`: the destination is you.
2. `reply_target`: the destination is the sender of the message the run answers.
3. `known_contact`: a contact you marked holds the destination.
   `nixie contacts mark-known <destination>` marks one, and `nixie contacts unmark <contactID>`
   removes it. A record forget of the marking record removes the contact's details, so the contact
   then grants nothing.
4. `task`: the task definition whose task run makes the call names the destination. No definition
   names one yet.
5. `rule`: an allow rule that matches the call names the destination.

A pattern with a `*` never gives the `task` or `rule` permission to an email address, so a whole
domain such as `*@example.org` covers no recipient. Only an exact address holds that trust, and you
name each one.

A destination with none of them asks at stage 5 unless consent covers it. A call reads the contacts
of its own snapshot, so a contact unmarked since still covers a replay of an earlier call.

## Consent

Consent has two parts. The code check runs first and needs no model: every destination appears word
for word in text you typed, or belongs to the one known contact whose name you typed as a word of
its own: "Sam" is no part of "Samson". A pasted or dropped span never counts. The checker, a model
that sees the call and your message, then answers asserted, not asserted or unsure. A failure of the
checker counts as unreachable.

- The turn's message counts with no age limit. A message the task passed on counts when you typed it
  within `policy.consent.link_max_age` hours, 24 by default.
- Stage 8 allows when the code check passes and the checker answers asserted.
- An ask at stage 5 or 9 where the code check passed and the checker did not agree has the cause
  `direct_request`. It is a defect to count, because you asked and nixie asked again.
- The checker has its own timeout, shorter than the fault deadline below.

## Asks

An ask writes the `tool_called` record and a `policy.action_proposed` record in one transaction, and
the model reads "Waiting for approval as `<shortID>`". The model keeps working. An ask's cause is
`outside_steering`, `always_ask`, `ask_rule`, `no_rule`, `direct_request`, `repeat` or
`condition_error`. The last is a call that asks because a deny rule's condition errored, as
[rule conditions](rule-conditions.md#evaluating-a-condition) describes.

Answer an ask with `nixie proposals approve <shortID>` or `nixie proposals reject <shortID>`, or on
the page for actions. The answer lands in the inbox of the task that asked. Approving queues the
call once, and the call runs as [actions](../core/actions.md#approved-actions) describes. A proposal
lapses after a fixed time without an answer. For the row and the answer path, read
[Approvals](approvals.md). `contacts.mark_known` is a tool that declares `policy_widen`, so it
always asks, and approving it marks the contact.

A call that asks again while its proposal is open, or while its approval is unused, writes no second
proposal. The model reads "Waiting for approval as `<shortID>`" with the open proposal's short ID,
or the status of the approved action.

## Faults

The tool endpoint races the decision against a deadline and against a throw. Either denies the call,
records the fault and the stage that was running, and tells the model "Not allowed: nixie could not
decide on this call. Try again later."

## Replay

`replayDecision` in `modules/policy` rebuilds a decision from its `tool_called` record and the
snapshot the record names. The consent code check and the checker's answer come from the record, so
a replay never calls the model. A record from before the full decision point holds no inputs and has
no replay.

## Effects and declarations

Every tool declares its effects, such as read, fetch, write, send or spend, and the declaration
lives in nixie's registry. The declaration also names the arguments that hold a destination, an
amount or free text, and the source of content of each field of the tool's result, which the
[tool endpoint](../connectors/tool-calls.md#records) records with every result.

The `delete` effect covers a removal for good: a file or an account at an outside service, or a
record of nixie's own that [`log.forget`](../channels/api.md#the-logforget-tool) erases. A tool that
declares it runs queued, as an action.

A definitions repository can change a tool's effects with a file in `effects/`, from format 4 on:

```yaml
mail.draft:
  add: [send]
  remove: [write]
```

An effect that joins a tool and an effect that leaves it both apply at the seed. An effect that
leaves widens the policy, because the tool can then pass a rule it did not before, but the seed
trusts the repo, as [rules in force](rules.md#rules-in-force) explains. The same holds for an effect
that a nixie release drops from a tool's declaration. A file that names an unknown tool or effect,
removes an effect the tool lacks, or adds one it already holds refuses the whole seed.

The declarations in force, with the overrides applied, are part of the policy that the snapshot hash
covers ([the definitions](../core/definitions.md#the-snapshot-hash)).

## The code rules

Two rules live in code, after the rules in your definitions. The queue check rule allows the
log-only connector's tool at stage 7, so the [queue check](../core/actions.md#the-queue-check)
reaches the action queue on every start. A test build adds a rule that allows the crash tests' send
tool. The bundler drops it from the release bundle.

With no rule of yours in force, stages 3, 6 and 7 never match. A call that stages 1 and 2 do not
deny and consent does not allow then asks at stage 9, except a memory write, which gets `gate`. The
start logs a warning.
