# Actions

`modules/actions` runs each allowed tool call with side effects as an action on the queue. An action
ends in one of 4 outcomes: pending, done, failed or unknown. A runner claims an action through the
same lease and generation as a task step, from [tasks](tasks.md#leases-and-the-claim-path), and runs
one attempt per claim. The actions projection holds each action's outcome, attempt count and next
attempt time, so a restart resumes the retry schedule where it stopped.

## From tool call to queue

The queue takes only a call that the [decision point](decision-point.md) allowed. The call carries
the claim of the step that made it, and the queue transaction checks that step's lease first, so a
runner that lost its lease queues nothing. Each action gets a random ID, which is both the queue key
and the idempotency key the connector sends. The arguments sit in the record's erasable fields, and
the decision sits on its envelope.

A repeat call with the same action hash returns the earlier action of the same task and queues
nothing, when that action came from the same step or is still pending or unknown. **Why:** the rerun
of a crashed step makes the same calls again, and an action that ran must never run twice.

## Attempts and outcomes

An attempt runs in 3 stages:

1. It records the attempt's start.
2. It calls the connector with the action ID as the idempotency key, and renews its lease meanwhile.
3. It records the result and the outcome in one transaction, and frees the lease.

A claim that finds a started attempt with no result marks the action unknown and calls no provider.
**Why:** the call may have reached the provider, so a second attempt could repeat it. An unknown
action stays unknown, because nothing reconciles it with the provider.

The connector's response picks the outcome:

| Response                             | Outcome | Wakes the task |
| ------------------------------------ | ------- | -------------- |
| Success                              | done    | Yes            |
| A refusal that cannot clear          | failed  | Yes            |
| A refusal that can clear             | pending | No             |
| An ambiguous reply, or a thrown call | unknown | Yes            |

A final outcome is an inbox record on the task's thread, so it wakes the task. Its erasable fields
hold the connector's result or the provider's reason.

## Retries

A refusal that can clear schedules the next attempt on a backoff, or later when the provider gives a
retry time. A connector can set its own schedule. A refusal on the last attempt fails the action
with retries exhausted as its reason. **Why:** the schedule rides out a rate limit or a short
outage, and an action still failing after that needs you more than another attempt.

## What the model sees

The model's turn waits a bounded time for the outcome, then sees one of 4 views: done with the
connector's result, failed with the reason, pending with the action ID, or unknown with a note that
the action may have happened. The model has no tool that retries an action or sets an outcome.

## Runners and recovery

Action attempts run in a pool apart from the task step runners. **Why:** a send then goes out while
every task runner is busy with a long turn.

Crash recovery marks each action that started an attempt with no result unknown
([crash recovery](tasks.md#crash-recovery)). The server passes that step to recovery, because tasks
never imports actions.
