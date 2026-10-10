# 0033: Model profiles and model cost

- Date: 2026-10-10
- Status: decided
- Design: [model profiles](../design/core/models.md), [budgets](../design/policy/budgets.md)
- Research: [model-eval spike](../../spikes/model-eval/README.md)

nixie reaches every model through a model profile: an Anthropic-compatible base URL, a credential
and its auth header, a model ID, a reasoning effort, an optional provider pin, and a price table.
The deployment configuration maps each model role to a profile: the conversation, other tasks,
workers, the checker and the memory writer. The platform's default for every role is GLM 5.3 at its
default reasoning effort.

Model limits count dollars, tokens and turns, each with a generous default that the deployment
configuration overrides. nixie computes dollars from each response's token counts and the profile's
prices, never from the cost the Agent SDK reports.

## Why

- The Agent SDK talks to any Anthropic-compatible endpoint, so one setting moves a role between a
  direct provider, an aggregator and Anthropic without code changes.
- Different roles need different models: the model-eval spike found the models differ on persona
  register, invented memory and cost per turn.
- The SDK prices every model at Anthropic's rates, which is wrong for any other model and notional
  on a flat subscription.
- Dollars bound a metered route, tokens bound load on a flat subscription, and turns catch a loop
  whatever the price, so no single measure covers every route.

## Alternatives

- **One model for every role, set in code.** It makes a change of provider a code change, and gives
  every role the most capable model's price.
- **Dollar limits from the SDK's reported cost.** They misprice every model outside Anthropic's
  catalogue, and stop nixie in ordinary use on a flat subscription.
- **Dollar limits only.** A flat subscription makes dollars notional, so a loop would run until the
  provider's own quota stopped it.

## Consequences

- The counting proxy holds one route per profile, so it prices each response with that profile's
  table.
- A role keeps its profile for the life of its sandbox, and a change applies at the next start.
- Real use tunes the budget defaults, which open items tracks.
