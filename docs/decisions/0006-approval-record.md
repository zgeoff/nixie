# 0006: The approval record

- Date: 2026-10-07
- Status: decided
- Research: [approval notes](../research/2.3-notes/approvals.md),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#approval-records)

An approval resolves one proposal from [0002](./0002-approvals.md), and nixie records it as follows:

- **Bound to one action.** The approval holds a hash of the exact action: the tool, its arguments
  and its destination. A change to any of them, such as one word of an email, invalidates the
  approval, and the model makes a new proposal.
- **Used once.** nixie consumes the approval in the database transaction that runs the action, so
  the approval cannot run the action twice.
- **Expires.** A proposal that the owner leaves unanswered lapses after a set time, and the task
  learns that it lapsed.
- **Delegation only narrows.** A subtask never holds wider permissions than the task that started
  it, and the record keeps the chain of tasks.
- **Consent in the owner's message.** When the owner's last direct message asks for an action on a
  target named verbatim, that message can carry consent. A separate model checks it, as auto-mode
  checks it under [0008](./0008-auto-mode.md). Naming a target alone is not consent, and injected
  content cannot reach the owner's message.
- **Approval from another device.** The owner gets a push with the structured details of the action
  and approves with a button bound to that one proposal. nixie checks that the answer came from the
  owner's identity on that channel. Track 2.5 covers which channels carry it.

## "Always allow"

When the owner approves with "always allow", nixie turns the approval into an ordinary rule from
[0004](./0004-rule-engine.md), which the owner can read and edit. The rule has no expiry. nixie can
read its own rules, records when each one last fired, and talks them through with the owner, so the
two find stale rules together. nixie's tooling sorts and filters rules by last use. Under
[0005](./0005-effects-and-taint.md), nixie can delete or tighten a rule at once, and adding or
loosening one asks the owner.

## Digest approvals

nixie offers one sheet that lists every pending proposal. Each item stays bound to its own action
hash, and the owner approves all, some or none of them. Proposals and taint make actions queue while
the owner is away, so approving them one at a time would carry most of the friction. Phase 3 designs
the sheet's layout and grouping together with the starter rule set.

## Alternatives

- **"Always allow" that expires after a period.** It keeps rules current at the cost of a renewal
  prompt and the risk of a surprise lapse.
- **Approvals one at a time only.** No shipping product offers digest approvals, but without them
  the owner works through each queued proposal alone.
