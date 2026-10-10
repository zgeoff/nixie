# Approvals in the client

- Status: Proposed
- Decisions: [0029](../../decisions/0029-channels-and-clients.md),
  [0002](../../decisions/0002-approvals.md), [0006](../../decisions/0006-approval-record.md),
  [0009](../../decisions/0009-first-channel.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0021](../../decisions/0021-outside-action-outcomes.md),
  [0023](../../decisions/0023-lifting-always-ask.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

The owner approves in nixie's own client, through a checked action bound to one proposal, never
through a chat message, under [0002](../../decisions/0002-approvals.md). Each proposal shows as an
approval card in the thread that asked, and every waiting item also appears on the digest sheet. An
approval for the always-ask set looks distinct from a routine one, and one that lifts the set looks
the most distinct, under [0023](../../decisions/0023-lifting-always-ask.md). The policy design owns
the rules, the risk class and the digest's data; this doc covers how the client shows them and how
the server checks the owner's answer. Everything in this doc beyond the decisions it links is a
proposal.

## What a card shows

A card renders one waiting item from the fields the policy design supplies:

- the action as a sentence, such as "Send an email to the booking desk", with the structured
  arguments and the destination below it, and long values such as an email body collapsed to their
  first lines
- for code, the execution boundary: where the code runs, its runtime image, and the egress and
  grants it gets, with credential references and allowed hosts but no secret values
- the declared effects, and the risk class: routine, always-ask, or lifting the always-ask set
- the prompt cause, such as "no rule matched", as an enumerated value that the client renders from a
  label table, so a cause that policy adds later renders without a client change
- for a "no rule matched" cause, the rule that would close the gap, as the sentence policy renders
- the task it belongs to, as a link that opens the task
- when it lapses, under [0006](../../decisions/0006-approval-record.md)
- for a lifting rule, its bounds and who proposed it: the owner, or nixie from a conversation

The approve button names the action, such as "Send email" or "Pay $18.40", and never reads only
"Approve". **Why:** a button that names what it does makes a misread card harder, and the always-ask
set exists for actions the owner must not approve by reflex.

## Risk classes look different

Each risk class has its own look, made of a label, an icon and a frame, so the class never depends
on colour alone:

| Class      | Label on the card                                     | Frame                       | Approve control                                   |
| ---------- | ----------------------------------------------------- | --------------------------- | ------------------------------------------------- |
| Routine    | None                                                  | The thread's own card style | One tap                                           |
| Always-ask | "Always asks" with the effect, such as "spends money" | A heavy warning frame       | One tap on its own card, never in a batch         |
| Lifting    | "Lifts the always-ask set"                            | The warning frame, inverted | One tap after the rule's bounds are shown in full |

A rule proposal from repeated approvals, a grant with an expiry and an "always allow" each widen a
rule, so policy gives them the always-ask class, and the client renders them that way. Once
[0012](../../decisions/0012-high-risk-approvals.md) lands, the always-ask and lifting controls ask
for the passkey check, and the routine control stays one tap.

## The owner's choices

A proposal card renders the choices that policy supplies for its kind, cause and class, and the
server checks those choices again. The common choices are checked actions:

- **Approve** runs the action once, under [0006](../../decisions/0006-approval-record.md).
- **Always allow**, when policy permits it for a routine gap or missing-consent cause, approves and
  creates the rule the card shows. Creating a rule widens policy, so the client asks for a second
  confirmation in the always-ask style before it sends the answer.
- **Defer** keeps the proposal pending until a chosen time, with an optional note. It is available
  on every proposal card, including always-ask and lifting cards.
- **Decline** closes the proposal, and the task learns of it in its next turn. An optional note goes
  to the task as an ordinary owner message, so the model reads why.

An ask-rule prompt offers "change this rule" instead of "always allow", and an always-ask spending
prompt can offer only the bounded lift that policy permits. A memory proposal shows why it needs
review, the exact item and version it changes, and the quote that backs it. It offers no "always
allow". The owner can approve their operation or edit the proposed text through the memory contract.
A common card does not turn these internal operations into provider calls.

The owner can also reply in the thread, such as "make it 8:30", and the model withdraws the proposal
and posts a new one, as [0002](../../decisions/0002-approvals.md) describes. The client shows a
withdrawn card as withdrawn, with a link to the proposal that replaced it.

### Defer

The time choices are 1 hour (a configurable default), this evening, tomorrow morning and custom,
with an optional note. The client resolves the named times in the owner's time zone and shows the
exact time before the owner confirms. The server checks the time and writes the defer record,
updates the proposal and its durable resurface and lapse timers in one transaction.

The proposal stays pending, moves to a collapsed "Deferred" group in the thread and digest sheet,
and counts in no push or routine approval batch. At the chosen time it returns as a fresh active
item. Its buzzing notice follows the notifier's presence gate, batching and quiet hours under
[when nixie pushes](./channel-adapter.md#when-nixie-pushes). The return itself is never held by
quiet hours. A withdrawn, declined, approved or lapsed proposal never resurfaces; its timer checks
the current proposal state and defer generation.

Defer sets the lapse to at least one full proposal-lapse interval after the chosen return time, or
after the end of quiet hours if that return falls inside them. The interval is the same configurable
per-effect value used at creation (72 hours by default). It never shortens an existing lapse and
never extends it past the action's real deadline. The item returns at the chosen time even if its
notice waits. A real deadline can still make it lapse before quiet hours end.

The optional `deadlineAt` on the proposal and action stores that real deadline, as
[outside actions](../core/outside-actions.md#from-tool-call-to-queue) defines. The client offers no
time past that deadline, and the server checks it again. If the deadline arrives first, the proposal
lapses. Deferral changes no action arguments or action hash.

The task receives an event such as "owner deferred until 18:00", plus the note, and can continue
other work. The agent does not ask why by default; at most it says "OK, I'll bring this back at 6".
Defer authorizes no action. A later approval stays bound to the exact action, and policy runs again
before the action executes. Defer needs the device-session check, not the approval's passkey check;
the passkey still applies when the owner approves an always-ask or lifting action.

An unknown outcome shows the same card with the action as it was proposed, what nixie tried, each
check's answer, and the 3 choices that
[outside actions](../core/outside-actions.md#unknown-outcomes-and-the-owner) sets: it happened,
retry, or drop.

## How the server checks an answer

Every answer is a call to a checked action in the [typed API](./client.md#the-typed-api), with the
proposal ID, the action hash the card rendered, the choice and a client action ID. The server:

1. checks the session against the owner record, and refuses a revoked or unknown session
2. checks that the proposal is still open and that the hash matches the open proposal
3. checks that the choice fits the class, so an always-ask item never arrives in a batch, and once
   0012 lands, that an approval of an always-ask or lifting item has a passkey assertion
4. records the answer with the session's identity row; a defer updates the timers without consuming
   approval, while an approval dispatches by the stored proposal kind. Outside actions consume it
   with queue insertion; memory and other internal operations consume it with their registered host
   transaction, under [policy approvals](../policy/approvals.md#the-approval)

A hash that no longer matches gets a `CONFLICT` error, and the client fetches the proposal again and
shows the changed action with the difference marked. **Why:** an action can return to a proposal
under the same ID after a rule narrows, so the ID alone does not prove the owner saw the current
action. The client action ID makes a retried answer run once.

The passkey check derives its WebAuthn challenge from the proposal ID and the action hash, with user
verification required, so the signed assertion covers that one action. WebAuthn has no standard
transaction confirmation, so the binding is nixie's own.

After an outside-action approval, the card follows queued, done, failed or unknown from canonical
records. A memory approval or another internal approval shows the receipt of the committed
operation, or shows that the operation failed or went stale. It has no stage on the outside action
queue. The card never infers success from the model's words.

## The digest sheet

The digest sheet lists every waiting item, and opens from a badge in the client and from the link in
a push. The groups follow the policy design's order:

1. unknown outcomes, under [0027](../../decisions/0027-tasks-and-outside-actions.md)
2. always-ask items: lifting rules, grants, rule proposals and always-ask actions
3. routine items, grouped by task, oldest first

Each item shows as one line: the action sentence, its task and its lapse time. A tap expands it to
the full card in place, so the owner never leaves the sheet to read the details. Routine items have
a checkbox, and the sheet offers "Approve selected" and "Approve all routine", as
[0028](../../decisions/0028-policy-design.md) records. Always-ask items keep their own controls on
each line and never join a batch.

Routine memory proposals join the routine batch. Each row shows whether the proposal remembers or
retires an item, the exact item and version it targets, why it needs review, and the proposed text
or the owner's request. The owner can expand the source and the evidence before approving. "Approve
all routine" submits the displayed item IDs and hashes; newly arrived items do not join that
request. Permanent forgetting keeps its separate checked flow and is never a routine proposal
approval.

A batch is one call that carries each item's proposal ID, action hash and choice. The server checks
and records each item on its own, and returns a result per item, so one stale item fails alone and
the rest go through. The sheet then shows the stale item expanded with its change marked.

The sheet updates live as items arrive, lapse or are answered on another device, and an item that
another device answered collapses with a note of which device. An empty sheet reads "Nothing
waiting".

## Lapses and reminders

A proposal lapses after the time [tasks](../core/tasks.md#waits) sets, and the card then shows it as
lapsed with no controls. A deferred item resurfaces with a new notice at its chosen time. Otherwise,
nixie sends no reminder push for an item a notice has counted. **Why:** the live notice from the
[push notifier](./channel-adapter.md#what-a-notice-holds) carries the count, and a reminder per item
works against the 0-prompt target.
