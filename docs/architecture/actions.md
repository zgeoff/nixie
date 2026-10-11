# Actions

`modules/actions` runs each allowed tool call with side effects as an action on the queue, with one
of 4 outcomes: `pending`, `done`, `failed` or `unknown`. A runner claims an action through the same
lease and generation as a task step, from [tasks](tasks.md), and runs one attempt per claim. The
`actions` projection holds each action's outcome, attempt count and next attempt time, so a restart
resumes the retry schedule where it stopped.

## From tool call to queue

`createAllowedAction` queues a call that the decision point allowed, and refuses any other decision.
The call carries the claim of the step that made it, and the queue transaction checks that step's
lease first, so a runner that lost its lease queues nothing. It writes `action.queued` with a new
action ID, which is the queue key and the idempotency key. The arguments sit in the record's
erasable fields, and the decision sits on its envelope.

A repeat call with the same action hash returns the earlier action and its status, and queues
nothing, when the earlier action has the same step key or is still `pending` or `unknown`. **Why:**
the rerun of a crashed step makes the same calls again, and an action that ran must never run twice.

## Attempts and outcomes

`runActionAttempt` runs one attempt in 3 stages:

1. It commits `action.attempt_started` with the attempt number.
2. It calls the connector with the action ID as the idempotency key, renewing the lease meanwhile.
3. It commits the result and the outcome in one transaction, and frees the lease.

A claim that finds an attempt record with no result writes an `unknown` outcome before anything
else, and calls no provider. **Why:** the call may have reached the provider, so a plain second
attempt could repeat it. An unknown action stays unknown, with its record, because no reconciliation
runs.

`pickOutcome` maps the connector's response to an outcome:

| Response                          | Outcome   | Record                   |
| --------------------------------- | --------- | ------------------------ |
| `success`                         | `done`    | `action.outcome`         |
| `refused`                         | `failed`  | `action.outcome`         |
| `refused_retryable`               | `pending` | `action.retry_scheduled` |
| `ambiguous`, or a call that threw | `unknown` | `action.outcome`         |

`action.outcome` is an inbox record, so it wakes the task. Its erasable fields hold the connector's
result or the provider's reason.

## Retries

A refusal that can clear waits 30 s, 2 min, 8 min and 30 min between the 5 attempts, or longer when
the provider names a retry time. A connector can set its own schedule. A refusal on the last attempt
fails the action with the reason `retries_exhausted`. **Why:** the schedule rides out a rate limit
or a short outage within about 40 min, and an action still failing after that needs you more than
another attempt.

## What the model sees

`waitForActionOutcome` waits inside the turn, 10 s by default, then returns `buildModelView` of the
action: `done` with the connector's result, `failed` with the reason, `pending` with
``queued as `<id>` ``, or `unknown` with "you were asked whether this happened". The model has no
tool that retries an action or sets an outcome.

## Runners and recovery

`startActionRunners` runs 4 attempts at once by default, in a pool apart from the 3 task step
runners. **Why:** a send then goes out while every task runner is busy with a long turn.

`writeUnknownOutcomes` is recovery step 3: it marks each action that has an attempt record with no
result unknown, with an `action.outcome` record. The server passes it to `runRecovery`.
