# Proposals and approvals

- Decisions: [0002](../../../decisions/0002-approvals.md),
  [0006](../../../decisions/0006-approval-record.md),
  [0011](../../../decisions/0011-memory-writes.md),
  [0012](../../../decisions/0012-high-risk-approvals.md),
  [0021](../../../decisions/0021-action-outcomes.md),
  [0023](../../../decisions/0023-lifting-always-ask.md),
  [0027](../../../decisions/0027-tasks-and-actions.md),
  [0028](../../../decisions/0028-policy-design.md)

When the [decision point](decision-point.md) asks, the tool creates a proposal and the turn ends.
You answer a proposal with a checked action in the client, never with a chat message. An approval
holds the hash of one exact action and is used once. Proposals that wait for you gather on the
approval digest. Policy owns the data and the rules here; [channels](../channels/approvals.md)
covers how the client shows cards, the approval digest and push.

## The proposal

A proposal is a row in the proposals projection of the [event log](../core/event-log.md), and each
change to it is a record. It holds:

| Field             | Holds                                                                       |
| ----------------- | --------------------------------------------------------------------------- |
| ID                | The operation ID, which an action keeps as its queue ID and idempotency key |
| Kind              | Action, memory write or internal change                                     |
| Action            | The canonical operation: tool, arguments, targets, destinations, effects    |
| Deadline          | An optional real deadline that the host validates                           |
| Execution profile | For code: the placement, image, egress and grants that the host resolved    |
| Action hash       | SHA-256 over the canonical operation                                        |
| Sentence          | The operation rendered from the tool's template                             |
| Risk class        | Routine, always-ask or lifting                                              |
| Cause             | The prompt cause, or the memory gate's review reason                        |
| Deciding rule     | The rule ID and revision, or none                                           |
| Proposed rule     | For a gap or "always allow", the rule as data and a sentence                |
| Task              | The task that proposed it, with its delegation chain                        |
| Proposer          | You, or nixie from a task                                                   |
| Created, lapse    | When it was created, and when it lapses                                     |
| Status            | Pending, approved, rejected, withdrawn, lapsed or consumed                  |

The registered operation fixes the proposal's kind, and neither model output nor a client request
changes it. Every kind shares the operation hash, the identity check, the lapse, rejection and
deferral. An action goes to the [action queue](../core/actions.md), a memory write applies an item
version under the [memory write contract](../memory/writes.md), and an internal change to policy, a
mandate or a job runs its registered host mutation. A memory proposal carries its operation,
remember or retire, its quote, and the exact item and version it targets; memory review counts stay
apart from policy prompts.

The canonical operation serialises like the [snapshot form](rules.md#the-snapshot-hash): sorted
keys, no whitespace, NFC strings. The hash covers the kind, the tool, every argument, the target
item and version, the execution profile, the validated deadline and every destination, so one
changed word in an email body makes a different operation, and the model posts a new proposal.

For code, the execution profile names the placement class, the runtime image, and the egress and
grant profile. A worker profile binds its sandbox generation and credential references, and a fresh
no-grant profile names its isolation. The executor checks that the sandbox it created matches the
approved profile before code starts, and a changed generation, grant profile or image makes the
approval stale, so the model cannot choose a weaker profile through arguments.

The sentence comes from a template the tool declares, filled from the structured fields, and the
client shows the fields beside it. The model writes none of it. **Why:** a prompt that a model wrote
from untrusted content could steer your answer, and you judge the action, not the model's account of
it.

A proposal lapses after 72 hours by default, which the lapse timer in [tasks](../core/tasks.md)
enforces. A memory proposal takes the longer lapse that the
[memory write contract](../memory/writes.md) sets. The model can withdraw a proposal and post a new
one, such as after you say "make it 8:30", because the conversation never waits on a proposal.

### Risk class

Policy computes each proposal's risk class from its effects, and the client renders the 3 classes
distinctly:

- **Routine:** no effect in the always-ask set.
- **Always-ask:** an effect in the always-ask set, a mandate, a proposed rule, or a known contact.
- **Lifting:** the operation creates or widens a lifting rule.

An always-ask or lifting approval takes the passkey check from
[0012](../../../decisions/0012-high-risk-approvals.md) once that check ships, and a tap in the first
build.

## The approval

Your answer is a checked action: the client sends the proposal ID and the action hash it showed, and
nixie accepts the answer only when the hash matches the proposal's current hash and the answer came
from your identity on that channel. **Why:** a proposal can return to pending under the same ID with
a new hash, such as when a rule narrows before an attempt, so a stale screen never approves a
different operation.

The approval record holds the proposal ID, the action hash, the rule hash for an "always allow", the
answer, the channel and device, the check used, and the chosen option. The host checks the current
operation, policy, target version and permitted choice, then consumes the approval by kind:

- an action consumes it in the transaction that queues it, under [actions](../core/actions.md);
- a memory write consumes it in the transaction that applies the item version, its notice and its
  receipt;
- an internal change consumes it with its registered host mutation.

A stale or ineligible operation applies nothing. Client action IDs make a retry return the existing
receipt, so a retried answer never consumes a second approval.

A rejection is a record that the task reads in its next turn, with your optional reason. A task
never proposes the same action hash again after a rejection in the same task run; the tool returns
the earlier rejection instead.

A task or worker never holds wider permissions than the thread that started it. The decision point
enforces this at its scope stage, and each proposal keeps the delegation chain, so you see which
task, started by which message, proposed it.

### Always allow

A routine proposal whose cause is outside steering or no rule matched offers "always allow" next to
"approve". The card shows the rule the choice creates as one sentence: the tool, this action's
destinations, and an `eq` check for each argument that is not free text. One tap runs the action
once and creates that rule, which has no expiry.

Creating the rule is a widening, and the card is its ask: you read the rule before the tap. The
proposal carries a rule hash beside the action hash, and your answer echoes both, so you approve
exactly the rule you read. After the tap, the client shows the rule under the reply with Edit and
Undo. Undo deletes the rule, a narrowing that applies at once. Once the passkey check ships, "always
allow" takes it, because the rule widens policy; the first build approves with the tap. **Why:** you
see what the rule allows before it exists, without a second confirmation, and a free-text field such
as an email body never pins a rule to one message.

The host supplies the choices each proposal permits and checks them again on your answer, so a
client cannot add one:

- A prompt from your ask rule offers "change this rule" instead of "always allow".
- A prompt from the always-ask set offers a lifting rule, for `spend` only, with caps you fill in.
- A memory proposal offers no "always allow", because accepting a fact never loosens the write gate.

A direct request that your own message consents to runs with no proposal, through the consent check
in the [decision point](decision-point.md#consent), and gets an ordinary decision record.

## The approval digest

The approval digest lists everything that waits for your answer, each item bound to its own action
hash. Policy owns what it holds and its order; the client lays it out. It holds 4 kinds of item, in
this order:

1. **Unconfirmed outcomes:** actions whose outcome is unknown and that reconciliation could not
   settle, each offering "it happened", "retry" and "drop", as [actions](../core/actions.md) covers.
2. **Lifting items:** proposals that create or widen a lifting rule.
3. **Always-ask items:** spending, raising a budget, mandates, proposed rules and known contacts.
4. **Routine items,** grouped by task, oldest first within each task.

**Why:** an unknown outcome may be a fault that changes how you answer the rest, and the riskiest
items come before the routine ones you can sweep.

"Approve all" covers routine items only, and each always-ask or lifting item takes its own approval.
Approving many items writes one record per item, each with its own action hash, so the batch equals
approving each item alone. An item you leave waits until it lapses. A gap group with a proposed rule
shows its pending items beside the proposal, so one visit approves both. Memory proposals join the
routine items; each row shows its operation, the item and version, the review reason and the
proposed text, and each still checks its target and applies on its own. Permanent forgetting is a
separate checked action and never joins the batch.
