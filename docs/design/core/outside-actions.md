# Outside actions

- Status: Proposed
- Decisions: [0002](../../decisions/0002-approvals.md),
  [0006](../../decisions/0006-approval-record.md),
  [0021](../../decisions/0021-outside-action-outcomes.md)

An outside action with side effects, such as sending an email or making a payment, runs as an entry
on a durable queue in the [event log](./event-log.md), with one of 4 outcomes: pending, done, failed
or unknown, under [0021](../../decisions/0021-outside-action-outcomes.md). nixie records each
attempt before it calls the provider, so a crash mid-call leaves an attempt with no result, and that
action becomes unknown. An unknown action is retried only with an idempotency key the provider
honours or after a check that it did not happen, and otherwise goes to the owner. The model reads
outcomes and never sets them. Everything in this doc beyond the decisions it links is a proposal.

[0021](../../decisions/0021-outside-action-outcomes.md) calls each queue entry a job. This doc calls
it an outside action, because a job is a definition with a schedule under
[0015](../../decisions/0015-taint-scope.md), and the terminology pass settles the word.

## From tool call to queue

An outside action enters the queue in 2 ways, both under [0002](../../decisions/0002-approvals.md):

- **An allowed call.** The tool asks the policy decision point, gets allow, and queues the action
  under an ID nixie creates.
- **An approved proposal.** The tool gets ask, and creates a proposal under that ID instead. When
  the owner approves, nixie queues the action under the same ID.

The action ID serves as the proposal ID, the queue entry's key and the idempotency key, so one
action keeps one identity from the tool call to the provider. Each action also holds the action hash
from [0006](../../decisions/0006-approval-record.md): the tool, its arguments and its destination.

An allowed call waits for its outcome inside the turn for a short bound, and returns the outcome
when it arrives in time. Otherwise the tool returns "queued as <id>", the turn goes on, and the
outcome reaches the task's inbox as a record, which the task's next turn reads. An approved proposal
always reports through the inbox, because its turn ended when the proposal was made.

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

A crash between the first stage and the third leaves an attempt record with no result. On restart,
nixie marks the action unknown, as step 3 of [crash recovery](./tasks.md#crash-recovery) lists. A
request that failed before it left the host, such as a refused connection, guarantees no effect, and
the connector reports it as a retryable refusal.

## Reconciliation per connector

Each connector declares, per action, what it can do after an unknown outcome, as
[0021](../../decisions/0021-outside-action-outcomes.md) requires:

- **Idempotency key.** The provider honours a key, and the declaration names where the key goes and
  how long the provider keeps it. nixie retries with the same key while the provider still keeps it,
  and treats an expired key as no key.
- **Check.** A read-only call that shows whether the action happened, such as a search of the Sent
  folder for the message ID that nixie set from the action ID. The declaration names the call and
  how long to wait before trusting a negative answer, since a provider can show a new item late.
- **Neither.** The action goes to the owner.

A check returns found, not found, or inconclusive. Found makes the action done, with the check's
answer as evidence. Not found returns the action to pending for a retry. Inconclusive sends it to
the owner. Each check and its answer is a record.

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

The client sends a content-free push for the item, as for any proposal under
[0009](../../decisions/0009-first-channel.md). The item shows in the live view and on the task board
until the owner answers, as [0021](../../decisions/0021-outside-action-outcomes.md) requires, and
the task's open waits include it. A task can carry on with other work while it waits.

## Options for the owner

- **The database.** The queue uses the same claim and wake-up as tasks, and the
  [event log doc](./event-log.md#options-for-the-owner) holds the trade-off. Neither database
  changes the outcomes or the reconciliation.
- **One queue for tasks and outside actions, or 2.** One table and one runner pool keep a single
  claim path and a single crash test suite. Separate pools let outside actions run when every task
  runner is busy with a long turn, and let the owner limit concurrent sends apart from concurrent
  turns. The recommendation is one claim mechanism with separate pools.

## Open questions

- How long an allowed call waits in its turn before it returns "queued as <id>".
- How many retries an idempotency key allows, and how far apart.
- Whether a rule that narrows after an approval, such as a new deny rule, stops a queued action that
  the approval already authorised. Rules apply at once under
  [0013](../../decisions/0013-definition-versioning.md), and the design proposes a check of deny
  rules and the always-ask set before the first attempt.
- Whether unknown items join the digest sheet from [0006](../../decisions/0006-approval-record.md)
  next to proposals.
- Whether the owner's retry of an unknown action in the always-ask set takes the passkey check from
  [0012](../../decisions/0012-high-risk-approvals.md), as the original approval would.
- Which word replaces "job" for a queue entry, in the terminology pass.
