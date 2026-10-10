# 0021: Action outcomes

- Date: 2026-10-08
- Status: decided
- Design: [actions](../design/platform/core/actions.md)
- Research:
  [engine notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.2-notes/engines.md)

An action, such as sending an email or making a payment, runs as an entry on the action queue, built
on nixie's event log from [0001](0001-durable-layer.md). Each action has an explicit outcome:
pending, done, failed or unknown.

An action interrupted after it may have reached the provider, such as a crash after the request left
and before nixie recorded the response, is marked unknown. nixie retries an unknown action only when
it passes an idempotency key that the provider honours, or after a check confirms that the action
did not happen, such as a look in the Sent folder. Otherwise the action goes to you, at the head of
the approval digest under [0027](0027-tasks-and-actions.md). The model cannot retry or report around
an unknown outcome, because the action's state machine allows neither.

## Why

- Consuming an approval in the transaction that starts the action, under
  [0006](0006-approval-record.md), stops the approval from running twice. It cannot make the
  provider's side effect happen exactly once, because the provider sits outside nixie's transaction.
- A queue retries an entry whose worker died, so on its own it delivers at least once. A crash after
  the provider accepted the request would send the email twice.
- Durable engines use a stable step ID as the idempotency key, and the same ID serves nixie.
- Without an explicit state, the model improvises after a crash: it guesses that the email went, or
  sends it again.

## Alternatives

- **Retry every interrupted action.** It is simple, and duplicates any action that reached the
  provider before the crash.
- **Never retry; ask after every interruption.** It is safe, and adds a prompt that an idempotency
  key or a check could avoid.

## Consequences

- Each connector declares, per action, whether the provider honours an idempotency key and how to
  check whether an action happened. An action with neither always goes to you after an interruption.
- An unknown outcome appears in the dashboard and the live view.
