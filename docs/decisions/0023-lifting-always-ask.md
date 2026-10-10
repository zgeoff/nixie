# 0023: Lifting the always-ask set

- Date: 2026-10-08
- Status: decided
- Design: [rules](../design/policy/rules.md)

The always-ask set from [0005](./0005-effects-and-taint.md) is the default, and a bounded rule can
lift it, such as "spend up to $20 per purchase and $100 per month at these merchants". 3 guards
apply:

- **A lifting rule is bounded.** Its bounds are a budget, and raising a budget is always-ask, so a
  lifting rule cannot grow quietly. An unbounded rule, such as "spend freely", is not allowed.
- **Creating or widening a lifting rule is always-ask.** Its confirmation shows the rule as a
  sentence and marks it as lifting the always-ask set, and it takes the passkey check from
  [0012](./0012-high-risk-approvals.md).
- **The record names who proposed it:** you, or nixie from a conversation.

Approvals look different by risk. nixie knows each action's declared effects, so the client renders
an approval in the always-ask set, and above all one that lifts it, as visually distinct from a
routine approval.

## Why

- The principle "The owner has root" lets you change every rule. A set that no rule can lift would
  break it.
- Approving something unwise is your right. The design makes such an approval clear, not impossible.
- No channel is out of a steered model's reach: nixie may edit its own definitions through a coding
  session. Your confirmation in the client is the real guarantee whichever channel proposes the
  rule, so a separate channel would add friction without adding protection.
- A record of who proposed each lift lets nixie and you find surprising or stale lifts, as nixie
  reviews its own rules with you under [0006](./0006-approval-record.md).

## Alternatives

- **No rule lifts the set.** It breaks the principle, and rules out a spending allowance for good.
- **Only the definitions repo can change the set, with a confirmation in the client.** It adds
  friction, and the repo is reachable through a coding session anyway.
