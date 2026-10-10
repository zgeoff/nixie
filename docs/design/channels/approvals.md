# Approvals in the client

- Decisions: [0029](../../decisions/0029-channels-and-clients.md),
  [0002](../../decisions/0002-approvals.md), [0006](../../decisions/0006-approval-record.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0023](../../decisions/0023-lifting-always-ask.md), [0028](../../decisions/0028-policy-design.md)

You approve in nixie's own client, through a checked action bound to one proposal, never through a
chat message. Each proposal shows as a card in the thread that asked, and every waiting item also
appears on the approval digest. The [policy approvals design](../policy/approvals.md) owns the
proposal, its risk class, its choices and the approval record; this doc covers how the client shows
them and how the server checks your answer.

## Cards

A card shows the action as a sentence with its arguments and destination, its risk class, its prompt
cause, its task and when it lapses. A code card adds where the code runs and the egress and grants
it gets, with no secret values. The approve button names the action, such as "Pay $18.40". **Why:**
a named action is harder to approve by reflex.

| Class      | Label                          | Frame                       | Approve control                        |
| ---------- | ------------------------------ | --------------------------- | -------------------------------------- |
| Routine    | None                           | The thread's own card style | One tap                                |
| Always-ask | "Always asks", with the effect | A heavy warning frame       | One tap on its own card, never batched |
| Lifting    | "Lifts the always-ask set"     | The warning frame, inverted | One tap after the rule's bounds show   |

A rule proposal and a mandate render as always-ask cards, because they widen policy. With
[0012](../../decisions/0012-high-risk-approvals.md), always-ask and lifting approvals and Always
allow ask for the passkey.

## Your choices

- **Approve** runs the action once.
- **Always allow** runs the action once and creates the rule the card shows as one sentence, in one
  tap. The answer carries the rule's hash with the action hash, so you approve exactly the rule you
  read. A notice then reads "Rule added: inbox jobs may reply to Sam · Edit · Undo". Spending and
  lifting cards never offer it.
- **Defer** keeps the proposal pending until a time you pick.
- **Decline** closes the proposal, and an optional note reaches the task as a message.

A reply in the thread, such as "make it 8:30", makes the model withdraw the proposal and post a new
one. An unknown outcome shows what nixie tried and the choices that
[actions](../core/outside-actions.md) sets: it happened, retry, or drop.

### Defer

Defer offers 1 hour (a configurable default), this evening, tomorrow morning and a custom time, with
an optional note.

1. The proposal stays pending in a collapsed "Deferred" group and counts in no push.
2. At the chosen time it returns as a fresh item with a buzzing notice, which waits for quiet hours.
3. The lapse moves to at least one full lapse interval after the return, or after quiet hours end
   when the return falls inside them. It never moves past the action's real deadline, the optional
   `deadlineAt` field that the action hash covers.
4. The task receives the defer and your note and carries on with other work. Its model does not ask
   why.

Defer authorizes nothing, so it needs no passkey, and policy runs again on the later approval.

## How the server checks an answer

Every answer carries the proposal ID, the action hash the card rendered, the choice and a client
action ID. The server checks the session, checks that the proposal is open and the hash matches,
checks that the choice fits the class, and then records the answer. An approved action enters the
action queue, and an internal operation such as a memory write commits in its own transaction. A
stale hash returns `CONFLICT`, and the client shows what changed. **Why:** a proposal can change
under the same ID after a rule narrows. The passkey challenge derives from the proposal ID and the
action hash, so the assertion covers that one action.

The card then follows the outcome from its records, never from the model's words.

## The approval digest

The approval digest lists every waiting item, opened from a badge or a push link, in policy's order:
unknown outcomes, then always-ask items, then routine items by task. Each item is one line that
expands to its card. Routine items take "Approve selected" and "Approve all routine", and always-ask
items never join a batch. A batch covers only the items on screen, and the server checks each item
on its own, so one stale item fails alone. An item answered on another device collapses with that
device's name.

nixie sends no reminder push for an item a notice has counted. **Why:** the live notice carries the
count, and a reminder per item works against the 0-prompt target.
