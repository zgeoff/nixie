# Model profiles

- Decisions: [0033](../../../decisions/0033-model-profiles.md),
  [0003](../../../decisions/0003-sdk-placement.md)

nixie reaches every model through a model profile: a named route to one model on one
Anthropic-compatible endpoint, with its credential and its prices. The profile, the role map, the
credential reference and the model on each record are built, and
[model profiles](../../../architecture/core/model-profiles.md) covers them. This design keeps what
the roles beyond the conversation use, the provider pin, the credential store's part and cost.

## Roles

| Role            | Uses its profile for                                              |
| --------------- | ----------------------------------------------------------------- |
| `conversation`  | The conversation's turns                                          |
| `task`          | Every other task's turns, job runs included                       |
| `worker`        | Each worker run, unless the tool sets a role of its own           |
| `checker`       | The consent checker and the memory checker, which share one model |
| `memory-writer` | Batched capture in [memory writes](../memory/writes.md)           |

Each sandbox that runs a model loop gets its role's profile when nixie creates it, and keeps that
profile for its life. A role change reaches a worker at its next worker run.

## The provider pin

A provider pin matters only on an aggregator endpoint. An aggregator keeps a prompt cache on one
upstream provider only while requests stay on that provider, so an unpinned route can lose the cache
between turns.

## Credentials

From slice 3, the deployment backend of the
[credential store](../connectors/credentials.md#backends) resolves a profile's `deployment:<name>`
reference, so no profile changes. A profile's credential can then live in the database credential
backend like any other credential, and the profile holds only the reference.

## Cost

nixie computes every turn's cost from token counts, never from the cost the Agent SDK reports. The
SDK prices every model at Anthropic's rates, which is wrong for any other model and notional on a
flat subscription. The [counting proxy](../policy/budgets.md#the-hard-spending-stop) reads the token
counts from each response and prices them with the profile's table:

```text
cost = uncached input × input price + cache write × cache write price
     + cached input × cached price + output × output price
```

Prices are in your currency. Reasoning tokens count as output. Every profile sets all 4 prices, and
a profile for an endpoint that charges no cache write premium sets its cache write price to its
input price. A response that reports no cached count is priced as all uncached input, so a missing
count never lowers a charge. A change to a profile's prices applies to charges after nixie reads it,
and never reprices a recorded turn. [Budgets](../policy/budgets.md#model-cost) set the limits that
these counts feed.
