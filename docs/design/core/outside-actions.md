# Outside actions

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md),
  [0006](../../decisions/0006-approval-record.md),
  [0021](../../decisions/0021-outside-action-outcomes.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0027](../../decisions/0027-tasks-and-outside-actions.md)

An outside action with side effects, such as sending an email or making a payment, runs as an entry
on a durable queue in the [event log](./event-log.md), with one of 4 outcomes: pending, done, failed
or unknown, under [0021](../../decisions/0021-outside-action-outcomes.md). nixie records each
attempt before it calls the provider, so a crash mid-call leaves an attempt with no result, and that
action becomes unknown. An unknown action is retried only with an idempotency key the provider
honours or after a check that it did not happen, and otherwise goes to the owner. The model reads
outcomes and never sets them. Everything in this doc beyond the decisions it links is a proposal.

[0021](../../decisions/0021-outside-action-outcomes.md) calls each queue entry a job.
[0027](../../decisions/0027-tasks-and-outside-actions.md) names it an outside action, because a job
is a definition with a schedule under [0015](../../decisions/0015-taint-scope.md).

## From tool call to queue

An outside action enters the queue in 2 ways, both under [0002](../../decisions/0002-approvals.md):

- **An allowed call.** The tool asks the policy decision point, gets allow, and queues the action
  under an ID nixie creates.
- **An approved proposal.** The tool gets ask, and creates a proposal under that ID instead. When
  the owner approves, nixie queues the action under the same ID.

The action ID serves as the proposal ID, the queue entry's key and the idempotency key, so one
action keeps one identity from the tool call to the provider. Each action also holds the action hash
from [0006](../../decisions/0006-approval-record.md): the tool, its arguments, its destination and
the optional `deadlineAt` from [the action deadline](#the-action-deadline).

An allowed call waits for its outcome inside the turn for up to 10 s by default, and returns the
outcome when it arrives in time. **Why:** a provider call that will succeed usually returns within
that time, and a longer wait holds the turn and the owner's reply behind it. Otherwise the tool
returns "queued as <id>", the turn goes on, and the outcome reaches the task's inbox as a record,
which the task's next turn reads. An approved proposal always reports through the inbox, because its
turn ended when the proposal was made.

### The action deadline

An action may carry an optional `deadlineAt`, an absolute timestamp supplied by checked connector
constraints or an explicit owner or job constraint. nixie validates that source on the host; model
text alone cannot invent an authoritative deadline. The proposal record and projection copy that
value, apart from their configurable lapse time. No value means no known real deadline.

The action hash covers `deadlineAt` with the tool, arguments and destination. Changing it needs a
new proposal, so defer cannot change it. The client receives it on reads and the live stream and
offers no defer time after it; the server repeats that check. The lapse timer runs no later than
`deadlineAt`. Approval consumption and each queue attempt check it too; an action past it never
starts. The lapse or refusal joins the task's inbox. These checks apply even without a defer.

## Consuming the approval

The approval is consumed in the transaction that queues the action. That transaction checks that the
action hash matches the approved proposal, marks the approval used with the action ID, and inserts
the pending action, so an approval can create only one queue entry.
[0006](../../decisions/0006-approval-record.md) consumes the approval in the transaction that runs
the action, and the provider call sits outside any transaction, so queuing is the part of running
that a transaction can hold.

Every attempt of that action, retries included, runs under the one consumed approval. A retry
repeats the approved action under the same ID; it is not a second use. An owner's choice to retry an
unknown action is a new checked action in the client, recorded with its own record, so it authorises
that retry on its own.

## Policy before each attempt

Rule changes reach running work at once under [0013](../../decisions/0013-definition-versioning.md),
so a queued action runs through nixie's deterministic layers again before every attempt: the rules,
the always-ask set and the destination limits. A rule that narrowed after the approval applies to
the action:

- **Deny** fails the action with the rule's ID, and the reason goes to the task's inbox.
- **Ask, on an action with an approval,** goes ahead, because the approval answered that ask. One
  exception: an action that newly falls in the always-ask set needs an approval of that class, so it
  returns to a proposal under the same ID.
- **Ask, on an action that a rule allowed,** returns the action to a proposal under the same ID.
- **Allow** goes ahead.

## Attempts and outcomes

A runner claims a pending action with the same lease and generation as a task step, covered in
[tasks](./tasks.md#steps-and-leases). Each attempt runs in 3 stages:

1. nixie commits an attempt record with the attempt number. From this commit on, the request may
   reach the provider.
2. The connector calls the provider, passing the action ID as the idempotency key where the provider
   takes one.
3. nixie commits the result and the outcome in one transaction.

The connector maps each provider response to an outcome:

- **Success** makes the action `done`, and the result goes to the task's inbox.
- **A refusal that guarantees no effect,** such as a validation error, makes the action `failed`,
  and the reason goes to the task's inbox.
- **A refusal that guarantees no effect but may clear,** such as a rate limit, keeps the action
  `pending` for a retry after a delay.
- **A timeout, a dropped connection or an ambiguous error** makes the action `unknown`, and
  reconciliation starts.

A crash between the first stage and the third leaves an attempt record with no result, and so does a
runner that loses its lease mid-call. A runner that claims an action whose last attempt has no
result marks the action unknown before anything else, so a lost lease leads to reconciliation, never
to a plain second attempt. On restart, nixie does the same for every such action, as step 3 of
[crash recovery](./tasks.md#crash-recovery) lists. A request that failed before it left the host,
such as a refused connection, guarantees no effect, and the connector reports it as a retryable
refusal.

Retries follow one default schedule, which a connector can override per action: up to 5 attempts in
all, waiting 30 s, 2 min, 8 min and 30 min between them, or longer when the provider names a retry
time. **Why:** the schedule rides out a rate limit or a short outage within about 40 min, and an
action still failing after that needs the owner more than another attempt. A retryable refusal on
the last attempt makes the action `failed`.

## Reconciliation per connector

Each connector declares, per action, what it can do after an unknown outcome, as
[0021](../../decisions/0021-outside-action-outcomes.md) requires:

- **Idempotency key.** The provider honours a key, and the declaration names where the key goes and
  how long the provider keeps it. nixie retries with the same key on the retry schedule while the
  provider still keeps it, and treats an expired key as no key.
- **Check.** A read-only call that shows whether the action happened, such as a search of the Sent
  folder for the message ID that nixie set from the action ID. The declaration names the call and
  how long to wait before trusting a negative answer, 60 s by default, since a provider can show a
  new item late.
- **Neither.** The action goes to the owner.

A check returns found, not found, or inconclusive. Found makes the action done, with the check's
answer as evidence. Not found returns the action to pending for a retry. An action whose attempts
end unknown 3 times goes to the owner, whatever the checks say. **Why:** 3 unknown outcomes in a row
point at a provider fault that another retry will not clear. Inconclusive sends it to the owner.
Each check and its answer is a record.

A tool from an outside MCP server declares nothing by default, because nixie's rules cannot see
inside the server under [0017](../../decisions/0017-mcp-proxy.md). An interrupted call to such a
tool goes to the owner, unless the owner's effect declaration for that tool names a check.

## What the model sees

The model sees each action's outcome as structured input, never as an instruction to act:

- `done`, with the provider's result as the connector types it
- `failed`, with the reason
- `pending`, with "queued as <id>"
- `unknown`, with "the owner was asked whether this happened"

The model has no tool that retries an action or sets its outcome. When the model calls the same tool
with the same action hash while an earlier action is pending or unknown, the tool returns the
earlier action's status instead of queuing a second one. The model can still write prose about an
action, but the owner learns an action's outcome from nixie's own record in the client, not from the
model's words.

## Unknown outcomes and the owner

An unknown action that reconciliation cannot settle becomes an item for the owner, in the same place
as proposals. The item shows the action as the proposal showed it, what nixie tried, each check's
answer, and 3 choices:

- **It happened:** nixie marks the action done, with the owner's answer as evidence.
- **Retry:** nixie runs the action again under the same ID, and the item states that the retry may
  duplicate the action.
- **Drop:** nixie marks the action failed.

The item joins the digest sheet from [0006](../../decisions/0006-approval-record.md), grouped first,
under [0027](../../decisions/0027-tasks-and-outside-actions.md). Retrying a payment whose outcome is
unknown asks for the passkey check from [0012](../../decisions/0012-high-risk-approvals.md) once
that check exists, as the first approval would. The client sends a content-free push for the item,
as for any proposal under [0009](../../decisions/0009-first-channel.md). The item shows in the live
view and on the task board until the owner answers, as
[0021](../../decisions/0021-outside-action-outcomes.md) requires, and the task's open waits include
it. A task can carry on with other work while it waits.

## Runner pools

Tasks and outside actions share one claim mechanism and run in separate pools. By default, 3 task
steps and 4 outside actions run at once, and the owner can change both. **Why:** one claim path
means one set of crash tests, while separate pools let a send go out when every task runner is busy
with a long turn, and let the owner limit concurrent sends apart from concurrent turns. The task
step limit is the limit on concurrent work that the [scope](../../scope.md) asks for in tier 2.
