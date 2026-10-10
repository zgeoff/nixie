# 0012: High-risk approvals

- Date: 2026-10-08
- Status: decided
- Research:
  [channel notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.5-notes/channels.md)

An approval in the always-ask set from [0005](0005-effects-and-taint.md) takes a passkey check, such
as a fingerprint or face check, in nixie's client. That covers spending, widening a rule, including
"always allow" and creating a mandate or a lifting rule, raising a budget, and retrying a payment
whose outcome is unknown. Every other approval is a tap. The first build approves everything with a
tap, and the passkey check follows as an early addition.

## Why

- Spending money, widening a rule and raising a budget are rare by design, so an extra step costs
  little.
- A tap alone lets anyone holding your unlocked phone approve them.
- A retry of an unknown payment can charge twice, so it carries the risk of the first approval.
- The passkey check sits on top of the approval flow and changes nothing beneath it, so it does not
  block the first build.

## Alternatives

- **A tap for every approval, permanently.** It is the least friction, and leaves the always-ask set
  open to anyone with your unlocked device.
- **A passkey check for every approval.** It adds a step to routine approvals, against the 0-prompt
  target.
- **A tap to retry an unknown payment.** It is one step fewer, and lets anyone holding your unlocked
  phone trigger a second charge.
