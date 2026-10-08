# 0023: Lifting the always-ask set

- Date: 2026-10-08
- Status: decided
- Amends: [0005](./0005-effects-and-taint.md)

The always-ask set from 0005 is the default, and the owner can lift it with a bounded rule, such as
"spend up to $20 per purchase and $100 per month at these merchants". 3 guards apply:

- **A lifting rule is bounded.** Its bounds are a budget, and raising a budget is always-ask, so a
  lifting rule cannot grow quietly. An unbounded rule, such as "spend freely", is not allowed.
- **Creating or widening a lifting rule is always-ask.** Its confirmation shows the rule as a
  sentence and marks it as lifting the always-ask set, and it takes the passkey check once
  [0012](./0012-high-risk-approvals.md) lands.
- **The record names who proposed it:** the owner, or nixie from a conversation.

Approvals look different by risk. nixie knows each action's declared effects, so the client renders
an approval for the always-ask set, and above all one that lifts it, as visually distinct from a
routine approval.

## Why

- The principle "the owner has root" lets the owner change every rule. A set that no rule can lift
  would break it.
- Approving something unwise is the owner's right. The design makes such an approval clear, not
  impossible.
- No channel is out of a steered model's reach: the owner may have nixie edit its own definitions
  through a coding session. The owner's confirmation in the client is the real guarantee whichever
  channel proposes the rule, so a separate channel would add friction without adding protection.
- A record of who proposed each lift lets nixie and the owner find surprising or stale lifts, as
  [0006](./0006-approval-record.md) has nixie review its own rules with the owner.

## Alternatives

- **No rule lifts the set.** It breaks the principle, and rules out a spending allowance for good.
- **Only the definitions repo can change the set, with a confirmation in the client.** It adds
  friction, and the repo is reachable through a coding session anyway.
