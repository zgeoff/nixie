# 0012: High-risk approvals

- Date: 2026-10-08
- Status: decided
- Research: [channel notes](../research/2.5-notes/channels.md),
  [2.4 to 2.6 landscape](../research/2.4-2.6-data-channels-connectors.md#channels)

An approval for the always-ask set from [0005](./0005-effects-and-taint.md) asks for a passkey
check, such as Face ID or Touch ID, in nixie's client from [0009](./0009-first-channel.md). Every
other approval is a tap. The first build ships with a tap for every approval, and the passkey check
follows as an early addition.

## Why

- Spending money, widening a rule and raising a budget are rare by design, so an extra step costs
  little.
- A tap alone lets anyone holding the owner's unlocked phone approve them.
- The passkey check sits on top of the approval flow and changes nothing beneath it, so it does not
  block the first build.

## Alternatives

- **A tap for every approval, permanently.** It is the least friction, and leaves the always-ask set
  open to anyone with the owner's unlocked device.
- **A passkey check for every approval.** It adds a step to routine approvals, against the 0-prompt
  target.
