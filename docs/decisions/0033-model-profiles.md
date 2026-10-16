# 0033: Model profiles and model cost

- Date: 2026-10-10
- Updated: 2026-10-16
- Status: decided
- Design: [model profiles](../design/platform/core/models.md),
  [budgets](../design/platform/policy/budgets.md)

nixie reaches every model through a model profile: an Anthropic-compatible base URL, a credential
and its auth header, a model ID, a reasoning effort, an optional provider pin, a prompt cache
lifetime, and a price table. The deployment configuration maps each model role to a profile: the
conversation, other tasks, workers, the checker and the memory writer. A role left unset uses the
conversation's profile, and an unset conversation role stops nixie at start.

The conversation writes its prompt cache entries with its profile's cache lifetime, 5 minutes or 1
hour. A profile that sets no lifetime gets 5 minutes, and the production deployment's conversation
profile sets 1 hour. The checker, the memory writer and the memory consolidator write 5-minute
entries on any profile.

Model limits count dollars, tokens and turns, each with a generous default that the deployment
configuration overrides. nixie computes dollars from each response's token counts and the profile's
prices, never from the cost the Agent SDK reports.

## Why

- The Agent SDK talks to any Anthropic-compatible endpoint, so one setting moves a role between a
  direct provider, an aggregator and Anthropic without code changes.
- Roles differ in what they need from a model, such as a short wait for a conversation reply and
  care over evidence for the memory writer, so each role names its own profile.
- The SDK prices every model at Anthropic's rates, which is wrong for any other model and notional
  on a flat subscription.
- A conversation turn more than 5 minutes after the last writes its whole context to the cache again
  under 5-minute entries, and reads it from the cache under 1-hour entries. A 1-hour entry costs
  more to write, so the longer lifetime pays off only when enough of the gaps between bursts of
  turns fall between 5 and 60 minutes; the
  [cache lifetime spike](../../research/cache-lifetime/README.md) puts that share at about 42%.
- The checker, the memory writer and the memory consolidator start a fresh session for each run, so
  a 1-hour entry would only cost more to write.
- Dollars bound a metered route, tokens bound load on a flat subscription, and turns catch a loop
  whatever the price, so no single measure covers every route.

## Alternatives

- **One model for every role, set in code.** It makes a change of provider a code change, and gives
  every role the most capable model's price.
- **Dollar limits from the SDK's reported cost.** They misprice every model outside Anthropic's
  catalogue, and stop nixie in ordinary use on a flat subscription.
- **Dollar limits only.** A flat subscription makes dollars notional, so a loop would run until the
  provider's own quota stopped it.
- **1-hour cache entries by default.** A deployment whose gaps between bursts fall under the
  break-even share pays up to about 45% more a day, and the spike leaves untested how an endpoint
  other than Anthropic's treats a 1-hour request, so each deployment chooses the longer lifetime.
- **The CLI's cache lifetime variable.** It sets the same lifetime as the setting, and would add one
  more variable to the guest's environment.

## Consequences

- The counting proxy holds one route per profile, so it prices each response with that profile's
  table.
- A role keeps its profile for the life of its sandbox, and a change applies at the next start.
- Real use tunes the budget defaults, which open items tracks.

## Changes

- 2026-10-16: added the profile's prompt cache lifetime, 5 minutes by default and 1 hour on the
  production conversation profile.
