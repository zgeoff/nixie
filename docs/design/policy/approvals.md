# Proposals and approvals

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md),
  [0006](../../decisions/0006-approval-record.md), [0011](../../decisions/0011-memory-writes.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0021](../../decisions/0021-outside-action-outcomes.md),
  [0023](../../decisions/0023-lifting-always-ask.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

When the [decision point](./decision-point.md) asks, the tool creates a proposal and the turn ends,
under [0002](../../decisions/0002-approvals.md). The owner answers a proposal with a checked action
in the client, never with a chat message. An approval holds the hash of one exact action and runs it
once, under [0006](../../decisions/0006-approval-record.md). Proposals that wait for the owner
gather on one digest sheet, where the owner answers all, some or none. This doc covers the data and
the rules; the channels design covers how the client presents them. Everything in this doc beyond
the decisions it links is a proposal.

## The proposal

A proposal is a row in the proposals projection of the
[event log](../core/event-log.md#projections), and each change to it is a record. It holds:

| Field              | Holds                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| ID                 | The operation ID; an outside action keeps it as its queue ID and idempotency key                                          |
| Kind               | Outside action, memory write or internal change, from the registered operation                                            |
| Action             | The canonical operation: tool, arguments, targets, destinations and declared effects                                      |
| Deadline           | Optional host-validated real deadline, distinct from the proposal lapse                                                   |
| Execution boundary | For code, the placement, image, egress and grant profile that the host resolved                                           |
| Action hash        | SHA-256 over the canonical action                                                                                         |
| Sentence           | The action rendered from the tool's template and the structured fields                                                    |
| Risk class         | Routine, always-ask, or lifting                                                                                           |
| Cause              | The decision-point prompt cause for a policy prompt, for outside actions and internal changes; absent for a memory review |
| Review reason      | The memory gate's review reason for a memory write, absent for outside actions and internal changes                       |
| Deciding rule      | The rule ID and revision, or none                                                                                         |
| Proposed rule      | For a gap, the rule that would remove it, as data and a sentence                                                          |
| Task               | The task that proposed it, with its delegation chain                                                                      |
| Proposer           | The owner, or nixie from a task, for a rule or a lift under 0023                                                          |
| Created, lapse     | When it was created, and when it lapses                                                                                   |
| Status             | Pending, approved, rejected, withdrawn, lapsed or consumed                                                                |

The registered operation determines the proposal kind; neither model output nor the checked client
request can change it. All kinds share exact-operation hashes, identity checks, expiry, rejection
and deferral. An outside-action proposal goes to the provider queue; a memory write applies an
internal version; an internal policy, grant or job change uses its registered host mutation. Their
common projection does not make every proposal a provider call.

A memory proposal carries the operation it binds, remember or retire, under
[0031](../../decisions/0031-memory-capture-context-and-removal.md). It also carries the quote behind
it: the evidence for a remember, or the owner's intent for a retire. It names the exact item and
version it targets. The memory gate supplies a structured review reason instead of one of the
decision point's six prompt causes. The host renders both from fixed labels. Memory review counts
stay separate from policy prompts, and its operation-specific lapse replaces the outside-action
default.

The canonical action serialises the same way as the snapshot form in
[rules](./rules.md#the-snapshot-hash): sorted keys, no whitespace, NFC strings. The hash covers the
kind, the tool, every argument, the target item and version, any execution boundary, the deadline
that the host validated, and every destination, so one changed word in an email body makes a
different action, and the model makes a new proposal, as 0006 requires.

For code execution, the canonical operation includes the placement class, the runtime image, and the
egress and grant profile, as the host resolves them. A worker profile binds its existing sandbox
generation and credential references with their host scopes; a fresh no-grant profile names its
required isolation without a sandbox ID that does not exist yet. The executor records the actual
created sandbox and checks that it matches the approved profile before code starts. A changed worker
generation, grant profile or image makes the approval stale; the model cannot choose a weaker
profile through arguments.

The sentence comes from a template the tool declares, filled from the structured fields, and the
client shows the fields beside it. The model writes none of it. **Why:** a prompt that a model wrote
from untrusted content could steer the owner's answer, and the owner should judge the action, not
the model's account of it.

A proposal lapses after 72 hours by default, which [tasks](../core/tasks.md#waits) sets with the
lapse timer. The model can withdraw a proposal and post a new one, such as after the owner says
"make it 8:30", because the conversation never waits on a proposal.

### Risk class

Policy computes each proposal's risk class from its declared effects, and the client renders the 3
classes distinctly, as [0023](../../decisions/0023-lifting-always-ask.md) requires:

- **Routine:** no effect in the always-ask set.
- **Always-ask:** an effect in the always-ask set, a grant, a proposed rule, or a known contact.
- **Lifting:** the action creates or widens a lifting rule.

An always-ask or lifting approval asks for the passkey check from
[0012](../../decisions/0012-high-risk-approvals.md) once that check exists, and a tap until then.

## The approval

The owner's answer is a checked action in the client: the client sends the proposal ID and the
action hash it displayed, and nixie accepts the answer only when the hash matches the proposal's
current hash and the answer came from the owner's identity on that channel. An "always allow" answer
also echoes the rule hash it displayed, and nixie checks it against the rule it offered. **Why:** a
proposal can return to pending under the same ID with a new hash, such as when a rule narrows before
an attempt, so a stale screen must not approve a different action.

The approval record holds the proposal ID, the action hash, the rule hash for an "always allow", the
answer, the channel and device, the check used (a tap or a passkey), and the selected choice. The
host dispatches by the stored proposal kind after it checks the current operation, policy, target
version and permitted choice. An outside action consumes approval in the transaction that queues it,
under [outside actions](../core/outside-actions.md#consuming-the-approval). A memory approval
consumes it in the transaction that applies the exact item version, provenance, notice and receipt,
as the [memory write contract](../memory/writes.md#memory-proposals) requires. An internal change
consumes it with the registered host mutation. Stale or ineligible operations apply nothing. Client
action IDs make retries return the existing receipt, and outside-action retries stay under their one
consumed approval.

A rejection is a record that the task reads in its next turn, with the owner's optional reason. A
task never proposes the same action hash again after a rejection in the same run, and the tool
returns the earlier rejection instead.

### Delegation

A task or worker never holds wider permissions than the thread that started it, under 0006. The
decision point enforces it at its scope stage, and each proposal keeps the chain from the record's
parent field, so the owner sees which task, started by which message, proposed the action.

### Always allow

A routine proposal from cause 3 or cause 5 offers "always allow" next to "approve once". The card
shows the rule that the choice creates, as one sentence: the tool, the destinations of this action,
and an `eq` check for each argument the tool does not declare as free-text content. One tap runs the
action once and creates that rule. The rule has no expiry, under 0006.

Creating the rule is a widening, and the card is its ask: the owner reads the rule on the card
before the tap. The proposal carries a rule hash beside the action hash, and the answer must echo
both, so the owner approves exactly the rule they read. After the tap, the client shows the rule
under the reply with Edit and Undo, and the owner loosens or tightens it there. Undo deletes the
rule, a narrowing that applies at once under [0005](../../decisions/0005-effects-and-taint.md). Once
the passkey check from [0012](../../decisions/0012-high-risk-approvals.md) ships, an "always allow"
takes it, because the rule widens policy. The first build approves it with the tap. The 0012 design
weighs a proposed exemption for a rule no wider than the card's own action, listed in
[open items](../open-items.md). **Why:** the owner sees exactly what the rule allows before it
exists, without a second confirmation, and a free-text field such as an email body never pins a rule
to one message.

The host supplies the applicable choices with each proposal and checks them again when the owner
answers. Memory-review proposals offer no "always allow": accepting a fact does not loosen the write
gate. A client cannot add a choice that the current operation, cause or risk class does not permit.

A prompt from the owner's ask rule offers "change this rule" instead, because an allow rule cannot
override an ask rule under [rules](./rules.md#evaluation-order). A prompt from the always-ask set
offers a lifting rule only for `spend`, with the caps the owner fills in.

## Consent in the owner's message

A direct request can run with no proposal when the owner's own message carries consent, under 0006.
The [decision point](./decision-point.md#destination-limits) owns the 2 checks: the destination
named word for word in typed text, and a checker model that confirms the request. A consented action
gets an ordinary decision record with no approval.

## The digest sheet

The digest sheet lists every item that waits for the owner, and each item stays bound to its own
action hash, under 0006. Policy owns what the sheet holds and in what order; the client lays it out.

The sheet holds 4 kinds of item, in this order:

1. **Unconfirmed outcomes:** outside actions whose outcome is unknown and that reconciliation could
   not settle, grouped first under [0027](../../decisions/0027-tasks-and-outside-actions.md). Each
   offers "it happened", "retry" and "drop", as
   [outside actions](../core/outside-actions.md#unknown-outcomes-and-the-owner) covers.
2. **Lifting items:** proposals that create or widen a lifting rule.
3. **Always-ask items:** spending, raising a budget, grants, proposed rules and known contacts.
4. **Routine items,** grouped by task, oldest first within each task.

**Why:** an unknown outcome may be a fault that changes how the owner answers the rest, and the
items with the most risk come before the routine ones that the owner can sweep.

"Approve all" covers the routine items only, and each always-ask or lifting item takes its own
approval, with the passkey check once 0012 lands, as the owner settled in
[0028](../../decisions/0028-policy-design.md). The owner can approve, reject or leave each item; an
item left alone keeps waiting until it lapses. Approving many items is one record per item, each
with its own action hash, so a digest approval is the same as approving each item alone.

A gap group with a proposed rule shows its pending items together with the proposal, so the owner
can approve the items and accept the rule in one visit. Memory proposals from
[0011](../../decisions/0011-memory-writes.md) join the routine items and the routine batch, as the
agreed routine-only sweep implies. Each memory row shows its operation, the exact item and version,
the review reason, and the proposed content or the retirement intent. The owner can open its source
and evidence before approving. The batch sends each displayed operation hash, not a request to
approve whatever arrives later. Every memory operation still checks its current target and applies
atomically on its own; a stale item fails alone. Permanent forgetting is a separate checked action
and never joins this routine batch.
