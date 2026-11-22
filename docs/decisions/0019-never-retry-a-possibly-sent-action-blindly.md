# 0019: nixie never retries a possibly-sent action blindly

- Date: 2026-11-22
- Status: decided

## Decision

An action is a call whose effects reach outside nixie, such as an email, a write or a payment, and
its provider is the outside service that carries it out. When an attempt to send an action ends with
no recorded result, as after a crash, the provider may have acted. nixie then gives the action the
status `unknown`, and never sends it again unless one of these holds:

- the retry carries the first attempt's idempotency key, which the provider uses to ignore a
  duplicate;
- a check with the provider finds that the action did not happen;
- the user, asked about the action, chooses to retry it. The user can instead say it happened, or
  drop it.

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
