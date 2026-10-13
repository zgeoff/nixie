# 0041: Approvals during a voice call

- Date: 2026-10-11
- Status: decided
- Design: [channel approvals](../design/platform/channels/approvals.md),
  [proposals and approvals](../design/platform/policy/approvals.md)

During a voice call, a proposal's card appears in the call screen of the device that carries the
call. The turn speaks a fixed template line, such as "It's on your screen", to announce it. A spoken
"yes" gets the fixed reply "Tap the card to approve" and never approves. No push goes to your other
devices during the call. A card you leave unanswered stays in the approval digest. A card that needs
the passkey check from [0012](0012-high-risk-approvals.md) shows the passkey prompt over the call
screen.

## Why

- [0002](0002-approvals.md) keeps a spoken "yes" from approving, so the card stays the checked
  action during a call.
- [0009](0009-first-channel.md) puts voice and approvals in one client, so the call screen adds no
  channel.
- A template line announces the card instead of the model, so the model cannot misdescribe what you
  approve.
- A proposal lasts 72 hours by default, so a card you miss during the call is not lost.

## Alternatives

- **The proposal waits until the call ends.** The call screen then needs no approval controls. It
  loses the main use of voice: you ask, confirm and hear the result in one call.
