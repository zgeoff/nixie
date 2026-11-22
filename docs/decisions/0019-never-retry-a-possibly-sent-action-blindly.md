# 0019: nixie never retries a possibly-sent action blindly

- Date: 2026-11-22
- Status: decided

## Decision

nixie never sends an action a second time when the first attempt may have reached its provider. An
action is a call whose effects reach outside nixie, such as an email, a write or a payment. When an
attempt has no recorded result, nixie gives the action the status `unknown` and settles it in one of
3 ways:

- a retry that carries the first attempt's idempotency key, which the provider uses to ignore a
  duplicate;
- a check with the provider that finds whether the action happened;
- the user's answer to whether it happened, whether to retry it, or whether to drop it.

[Actions](../architecture/core/actions.md#outcomes) covers each status an action can reach.

## Why

- nixie cannot take back a second email or a second payment.
- After a crash between an attempt and its result, nixie has no record of whether the provider
  acted.

## Rejected alternatives

| Option                                  | Why not                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| send every attempt with no result again | A crash after the provider acted sends the action a second time.     |
| drop every attempt with no result       | nixie loses an action the provider never received, and tells no one. |

## Consequences

- After a crash, nixie asks the user about an action whose provider takes no idempotency key and
  offers no check.
