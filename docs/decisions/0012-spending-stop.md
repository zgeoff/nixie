# 0012: A model gateway on the host is the hard spending stop

- Date: 2026-10-09
- Status: decided

## Decision

Every model request passes through a proxy on nixie's host that counts the cost and refuses requests
once a deployment budget is spent, and fails closed. A spend limit set with the model provider,
where one exists, backs it up.

## Why

- The SDK's own budget cap runs inside the imp, next to code that reads untrusted content, and the
  runner's checks between steps let a looping turn overshoot.
- A proxy on the host enforces budgets mid-turn, and the provider's limit catches a fault in the
  proxy.

## Rejected alternatives

| Option                     | Why not                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| the SDK's own budget cap   | It runs inside the imp, next to code that reads untrusted content. |
| the runner's checks alone  | They overshoot by a turn.                                          |
| the provider's limit alone | It sits off your host and depends on the provider.                 |

## Consequences

- The proxy needs imp's broker to forward model requests through it, which a spike on an imp host
  checks before the first build relies on it.
