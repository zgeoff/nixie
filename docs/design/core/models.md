# Model profiles

- Decisions: [0033](../../decisions/0033-model-profiles.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

nixie reaches every model through a model profile: a named route to one model on one
Anthropic-compatible endpoint, with its credential and its prices. Each model role, such as the
conversation or the consent checker, names the profile it uses. You change a role's model by
pointing the role at another profile in the deployment configuration, and no code changes.

## The profile

| Field            | Holds                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| ID               | A stable slug, such as `chat-direct` or `background-aggregator`       |
| Base URL         | The Anthropic-compatible endpoint the Agent SDK calls                 |
| Credential       | A reference into the [credential store](../connectors/credentials.md) |
| Auth header      | `authorization: Bearer` or `x-api-key`, whichever the endpoint takes  |
| Model            | The model ID the endpoint expects                                     |
| Reasoning effort | The effort level passed on every call                                 |
| Provider pin     | Optional: the upstream provider an aggregator endpoint must use       |
| Prices           | Per million tokens: input, cache write, cached input and output       |

The runner starts each model loop with the profile's base URL, model and effort in `options.env`,
beside the fixed options that [serving nixie's tools](../connectors/tools.md#starting-a-model-loop)
lists. The guest sees a placeholder credential, and imp's broker injects the profile's credential in
the profile's auth header, limited to the base URL's host. **Why:** an API key on Anthropic's own
endpoint takes `x-api-key`, and a token on a gateway or an aggregator takes a bearer header.

A provider pin matters only on an aggregator endpoint. An aggregator keeps a prompt cache on one
upstream provider only while requests stay on that provider, so an unpinned route can lose the cache
between turns.

## Roles

| Role            | Uses its profile for                                              |
| --------------- | ----------------------------------------------------------------- |
| `conversation`  | The conversation's turns                                          |
| `task`          | Every other task's turns, job runs included                       |
| `worker`        | Each worker run, unless the tool sets a role of its own           |
| `checker`       | The consent checker and the memory checker, which share one model |
| `memory-writer` | Batched capture in [memory writes](../memory/writes.md)           |

The deployment configuration sets each role's profile and each profile's effort, and nixie ships no
default mapping. A role left unset uses the conversation's profile. nixie refuses to start when the
conversation role is unset. **Why:** the conversation is the one role every deployment runs, so one
setting gives a working deployment, and a missing model never shows up as a failed turn.

## Configuration

Profiles and the role map are deployment configuration, read at start. A profile's credential lives
in the deployment's secrets or the database credential backend like any other credential, and the
profile holds only the reference. A change to a profile's prices applies to charges after nixie
reads it, and never reprices a recorded turn.

Each sandbox that runs a model loop gets its role's profile when nixie creates it, and keeps that
profile for its life. A role change reaches the conversation when its imp next starts, and reaches a
worker at its next worker run.

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
count never lowers a charge. [Budgets](../policy/budgets.md#model-cost) set the limits that these
counts feed.
