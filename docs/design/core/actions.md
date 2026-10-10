# Actions

- Decisions: [0002](../../decisions/0002-approvals.md),
  [0006](../../decisions/0006-approval-record.md), [0021](../../decisions/0021-action-outcomes.md),
  [0025](../../decisions/0025-database-and-topology.md),
  [0027](../../decisions/0027-tasks-and-actions.md)

An action is a tool call with side effects outside nixie, such as sending an email or making a
payment. It runs as an entry on the action queue in the [event log](./event-log.md), with one of 4
outcomes: pending, done, failed or unknown, under [0021](../../decisions/0021-action-outcomes.md).
nixie records each attempt before it calls the provider, so a crash mid-call leaves an attempt with
no result, and the action becomes unknown. An unknown action is retried only with an idempotency key
the provider honours or after a check that it did not happen; otherwise it comes to you. The model
reads outcomes and never sets them.

## From tool call to queue

An action enters the queue in 2 ways, under [0002](../../decisions/0002-approvals.md):

- **An allowed call.** The tool asks the policy decision point, gets allow, and queues the action
  under an ID nixie creates.
- **An approved proposal.** The tool gets ask and creates a proposal under that ID. When you
  approve, nixie queues the action under the same ID.

The action ID is the proposal ID, the queue key and the idempotency key, so one action keeps one
identity from the tool call to the provider. Each action also holds the action hash from
[0006](../../decisions/0006-approval-record.md), which [policy approvals](../policy/approvals.md)
defines.

An allowed call waits up to 10 s by default for its outcome inside the turn, then returns "queued as
`<id>`", and the outcome reaches the task's inbox for its next turn.

## The action deadline

An action can carry an optional `deadlineAt`, a real deadline such as a booking slot. Only checked
connector constraints, or a constraint you or a job set, supply it, and nixie validates the source
on the host, so model text cannot invent one. The action hash covers `deadlineAt`, so changing it
needs a new proposal. The lapse timer, approval consumption and every queue attempt check it, and an
action past its deadline never starts. The client offers no defer time past it, and the server
checks that too.

## Consuming the approval

The approval is consumed in the transaction that queues the action. That transaction checks that the
action hash matches the approved proposal, marks the approval used with the action ID, and inserts
the pending action, so one approval creates one queue entry. Every attempt of that action, retries
included, runs under that one approval. Your choice to retry an unknown action is its own checked
action with its own record.

## Policy before each attempt

Rule changes reach running work at once under [0013](../../decisions/0013-definition-versioning.md),
so a queued action runs through the rules, the always-ask set and the destination limits again
before every attempt:

- **Deny** fails the action with the rule's ID, and the reason goes to the task's inbox.
- **Ask, on an approved action,** goes ahead, because the approval answered that ask. One exception:
  an action that newly falls in the always-ask set returns to a proposal under the same ID.
- **Ask, on an action a rule allowed,** returns the action to a proposal under the same ID.
- **Allow** goes ahead.

## Attempts and outcomes

A runner claims a pending action with the same lease and generation as a task step, and never claims
an action under a [recovery hold](./tasks.md). Each attempt runs in 3 stages:

1. nixie commits an attempt record with the attempt number.
2. The connector calls the provider, passing the action ID as the idempotency key where the provider
   takes one.
3. nixie commits the result and the outcome in one transaction.

The connector maps each provider response to an outcome:

| Response                                        | Outcome                                    |
| ----------------------------------------------- | ------------------------------------------ |
| Success                                         | `done`, and the result goes to the inbox   |
| A refusal with no effect, such as a bad request | `failed`, and the reason goes to the inbox |
| A refusal with no effect that can clear         | `pending`, retried after a delay           |
| A timeout, a dropped connection or an ambiguity | `unknown`, and reconciliation starts       |

An attempt record with no result means the call may have reached the provider. A runner that claims
such an action, or a restart that finds one, marks it unknown before anything else, so a lost lease
leads to reconciliation, never to a plain second attempt.

Retries follow one default schedule, which a connector can override: up to 5 attempts, waiting 30 s,
2 min, 8 min and 30 min between them, or longer when the provider names a retry time. **Why:** the
schedule rides out a rate limit or a short outage within about 40 min, and an action still failing
after that needs you more than another attempt. A retryable refusal on the last attempt makes the
action `failed`, and the reason goes to the task's inbox.

## Reconciliation per connector

Each connector declares, per action, what it can do after an unknown outcome:

- **Idempotency key.** The provider honours a key, and the declaration names where the key goes and
  how long the provider keeps it. nixie retries with the same key while the provider keeps it.
- **Check.** A read-only call that shows whether the action happened, such as a search of the Sent
  folder for the message ID that nixie derived from the action ID. The declaration names how long to
  wait before trusting a negative answer, 60 s by default.
- **Neither.** The action comes to you.

A check returns found, not found or inconclusive. Found makes the action done. Not found returns it
to pending for a retry. Inconclusive brings it to you, and so do 3 unknown outcomes in a row.
**Why:** 3 unknowns in a row point at a provider fault that another retry will not clear. A tool on
an [external server](../connectors/mcp-proxy.md) declares nothing by default, so an interrupted call
to it comes to you unless its effect declaration names a check.

## What the model sees

The model sees each outcome as structured input, never as an instruction to act: `done` with the
connector's typed result, `failed` with the reason, `pending` with "queued as `<id>`", or `unknown`
with "you were asked whether this happened". The model has no tool that retries an action or sets an
outcome. A repeat call with the same action hash while an earlier action is pending or unknown
returns the earlier action's status instead of queuing a second one. You learn an outcome from
nixie's own record in the client, never from the model's words.

## Unknown outcomes

An unknown action that reconciliation cannot settle comes to you in the approval digest, grouped
first, with a content-free push. The item shows the action as its proposal showed it, what nixie
tried, and each check's answer, with 3 choices:

- **It happened:** nixie marks the action done, with your answer as evidence.
- **Retry:** nixie runs the action again under the same ID, and the item warns that a retry may
  duplicate it.
- **Drop:** nixie marks the action failed.

Retrying a payment with an unknown outcome takes the same passkey check as its first approval, once
[0012](../../decisions/0012-high-risk-approvals.md) lands. The item stays on the dashboard until you
answer, and the task can carry on with other work meanwhile.

## Runner pools

Tasks and actions share one claim mechanism and run in separate pools: 3 task steps and 4 actions at
once by default, both settable. **Why:** one claim path means one set of crash tests, while separate
pools let a send go out when every task runner is busy with a long turn. The task step limit is the
limit on concurrent work that the [scope](../../scope.md) sets in tier 2.
