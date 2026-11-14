# The decision point

Every tool call passes the decision point before it acts, and the decision point answers allow, ask
or deny. It decides from what the tool declares it does, the rules in force, who the call sends to,
and whether you asked for it. The record of the call keeps the decision beside the snapshot hash of
the definitions in force, and a replay rebuilds the decision from that record. A call to a listed
tool whose input breaks the tool's input schema never reaches the decision point, because the
[tool endpoint](../connectors/tool-calls.md#the-call-steps) checks the input first. `modules/policy`
owns the decision point and the effect declarations. [Tool calls](../connectors/tool-calls.md)
covers how a call reaches it, and the
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

The caller's tool list is the run's own: the job's list for a job run, and the subset its caller
passed for a worker. A tool that the registry knows but the run was not given is therefore denied,
even though the model can name it.

A rule's effects are the tool's declared effects, so the same tool gets the same answer under the
same rules unless a rule also names argument checks, a context or a source of content. When several
rules of one outcome match, the first by rule ID decides, and the decision names the others.

## Destinations

Stage 5 gives each destination of a call the first permission that holds:

1. `owner`: the destination is you.
2. `reply_target`: the destination is the sender of the message the run answers.
3. `known_contact`: a contact you marked holds the destination.
   `nixie contacts mark-known <destination>` marks one, and `nixie contacts unmark <contactID>`
   removes it. A record forget of the marking record removes the contact's details, so the contact
   then grants nothing.
4. `job`: the job definition that runs the call names the destination. No definition names one yet.
5. `rule`: an allow rule that matches the call names the destination.

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
`outside_steering`, `always_ask`, `ask_rule`, `no_rule`, `direct_request` or `repeat`.

`nixie proposals approve <shortID>` and `nixie proposals reject <shortID>`, or the page for actions,
answer it. The answer lands in the inbox of the task that asked. Approving runs nothing yet: the
model reads that the action did not run. A proposal lapses after a fixed time without an answer.
[Approvals](approvals.md) describes the row and the answer path. `contacts.mark_known` is a tool
that declares `policy_widen`, so it always asks, and until approved actions run only the CLI marks a
contact.

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

A definitions repository can change a tool's effects with a file in `effects/`, from format 4 on:

```yaml
mail.draft:
  add: [send]
  remove: [write]
```

An effect that joins a tool applies at once. An effect that leaves widens the policy, because the
tool can then pass a rule it did not before, so the tool keeps it until you approve the removal in
the rule change proposal of that seed. A file that names an unknown tool or effect, removes an
effect the tool lacks, or adds one it already holds refuses the whole seed.

An approval covers the removal until the next seed applies it. If the effect later returns and a
file removes it again, the removal waits for a new approval. The proposal lists each removal with a
sentence, in `nixie proposals list` and on the proposals screen.

The declarations in force, with the overrides applied, are part of the policy that the snapshot hash
covers ([the definitions](../core/definitions.md#the-snapshot-hash)).

## The code rules

Two rules live in code, after the rules in your definitions. The queue check rule allows the
log-only connector's tool at stage 7, so the [queue check](../core/actions.md#the-queue-check)
reaches the action queue on every start. A test build adds a rule that allows the crash tests' send
tool. The bundler drops it from the release bundle.

With no rule of yours in force, every call that consent does not allow asks. The start logs a
warning, and names the first seed's rule change proposal when it still waits for your approval.
