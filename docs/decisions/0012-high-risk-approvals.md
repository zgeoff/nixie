# 0012: High-risk approvals

- Date: 2026-10-08
- Updated: 2026-10-15
- Status: decided
- Research:
  [channel notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.5-notes/channels.md)

An approval in the always-ask set from [0005](0005-effects-and-taint.md) takes a passkey check, such
as a fingerprint or face check, in nixie's client. That covers spending, widening a rule, creating a
mandate or a lifting rule, raising a budget, and retrying a payment whose outcome is unknown. Every
other approval is a tap. The first build approves everything with a tap, and the passkey check
follows as an early addition.

One exception: an unchanged "always allow" is one tap, though its rule is a widening. That rule
holds the tool, the action's destinations, and an `eq` check on each argument that is not free text.
A rule wider than that card's rule takes the passkey check: a rule you edit wider before you approve
it, a gap rule that covers several destinations, a mandate, or a lifting rule. The host decides
which applies with its widening check, never the client.

## Why

- Spending money, widening a rule and raising a budget are rare by design, so an extra step costs
  little.
- A tap alone lets anyone holding your unlocked phone approve them.
- A retry of an unknown payment can charge twice, so it carries the risk of the first approval.
- "Always allow" is the main way nixie reaches the 0-prompt target, so a step added there means more
  prompts later.
- The card's rule pins its destinations, so injected content cannot redirect it, and anyone holding
  your unlocked phone can approve the same action once with a tap anyway.
- The client shows a new rule under the reply with Undo, so you can spot and remove a rule you did
  not make.
- The passkey check sits on top of the approval flow and changes nothing beneath it, so it does not
  block the first build.

## Alternatives

- **A tap for every approval, permanently.** It is the least friction, and leaves the always-ask set
  open to anyone with your unlocked device.
- **A passkey check for every approval.** It adds a step to routine approvals, against the 0-prompt
  target.
- **A passkey check for every "always allow".** It is the strictest, and adds a step to the main way
  nixie learns your habits.
- **A tap for every "always allow", however wide.** It lets anyone holding your unlocked phone
  create a broad rule with one tap.
- **A tap to retry an unknown payment.** It is one step fewer, and lets anyone holding your unlocked
  phone trigger a second charge.

## Changes

- 2026-10-09: retrying a payment whose outcome is unknown takes the passkey check, as the first
  approval would.
- 2026-10-11: an unchanged "always allow" is a tap, and only a rule wider than the card's rule takes
  the passkey check.
