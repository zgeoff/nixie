# 0021: Outside action outcomes

- Date: 2026-10-08
- Status: decided, amended by [0027](./0027-tasks-and-outside-actions.md)
- Amends: [0006](./0006-approval-record.md)
- Research:
  [engine notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.2-notes/engines.md),
  [Hermes notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.1-notes/hermes.md#restart-behaviour)

An outside action with side effects, such as sending an email or making a payment, runs as a job on
a durable queue built on nixie's event log from [0001](./0001-durable-layer.md). Each job has an
explicit outcome: pending, done, failed or unknown.

A job interrupted after it may have reached the provider, such as a crash after the request left and
before nixie recorded the response, is marked unknown. nixie retries an unknown job only when it
passes an idempotency key that the provider honours, or after a check confirms that the action did
not happen, such as a look in the Sent folder. Otherwise the job goes to the owner. The model cannot
retry or report around an unknown outcome, because the job's state machine allows neither.

## Why

- Consuming an approval in the transaction that starts the action, under 0006, stops the approval
  from running twice. It cannot make the provider's side effect happen exactly once, because the
  provider sits outside nixie's transaction.
- A queue retries a job whose worker died, so on its own it delivers at least once. A crash after
  the provider accepted the request would send the email twice.
- Hermes records a side effect it cannot prove as `unknown` after a restart
  ([Hermes notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.1-notes/hermes.md#restart-behaviour),
  2026-10-07), and the durable engines studied use a stable step or workflow ID as the idempotency
  key
  ([engine notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.2-notes/engines.md),
  2026-10-07).
- Without an explicit state, the model improvises after a crash: it guesses that the email went, or
  sends it again.

## Alternatives

- **Retry every interrupted action.** It is simple, and duplicates any action that reached the
  provider before the crash.
- **Never retry; ask the owner after every interruption.** It is safe, and adds a prompt that an
  idempotency key or a check could avoid.

## Consequences

- Each connector declares, per action, whether the provider honours an idempotency key and how to
  check whether an action happened. An action with neither always goes to the owner after an
  interruption.
- An unknown outcome appears in the live view from [0018](./0018-main-thread-and-tasks.md) and in
  the main thread's task board.
