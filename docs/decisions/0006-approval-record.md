# 0006: The approval record

- Date: 2026-10-07
- Status: decided
- Design: [proposals and approvals](../design/policy/approvals.md)
- Research:
  [approval notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.3-notes/approvals.md)

An approval resolves one proposal from [0002](./0002-approvals.md), and nixie records it as follows:

- **Bound to one action.** The approval holds a hash of the exact action: the tool, its arguments,
  its destination and any real deadline. A change to any of them, such as one word of an email,
  invalidates the approval, and the model makes a new proposal.
- **Used once.** nixie consumes the approval in the database transaction that starts the action, so
  the approval cannot run the action twice. Whether the provider's side effect happens once is set
  by [0021](./0021-action-outcomes.md).
- **Expires.** A proposal left unanswered lapses after a set time, and the task learns that it
  lapsed. Defer under [0029](./0029-channels-and-clients.md) extends the lapse, never past the
  action's real deadline.
- **Delegation only narrows.** A task or worker never holds wider permissions than the task that
  started it, and the record keeps the chain.
- **Consent in your message.** When your last direct message asks for an action, that message
  carries consent. Code checks that every destination appears word for word in text you typed, or
  that a name you typed matches exactly one saved contact with that destination. nixie's consent
  checker from [0028](./0028-policy-design.md) then confirms the request. Naming a target alone is
  not consent, and injected content cannot reach your message.
- **Checked identity.** An approval comes from a checked action in nixie's client, bound to that one
  proposal, from a signed-in device. An approval for the always-ask set takes the passkey check from
  [0012](./0012-high-risk-approvals.md).

## "Always allow"

"Always allow" approves the action and creates an ordinary rule from [0004](./0004-rule-engine.md),
which you can read and edit. The card shows that rule as one sentence before the tap, and the
approval binds the hash of the rule you saw. The rule has no expiry. nixie reads its own rules,
records when each one last fired, and talks them through with you, so the two of you find stale
rules together. The client sorts and filters rules by last use.

## The approval digest

The approval digest lists everything that waits on your answer. Each item stays bound to its own
action hash. "Approve all" covers routine items only, and each always-ask or lifting item takes its
own approval. Actions whose outcome is unknown lead the digest, under
[0027](./0027-tasks-and-actions.md), and deferred items collapse into their own group until they
return.

## Why

- Proposals and the destination limits make actions queue while you are away, so approving them one
  at a time would carry most of the friction.
- A purchase or a widened rule hidden in a batch is the case that distinct rendering under
  [0023](./0023-lifting-always-ask.md) exists to prevent.

## Alternatives

- **"Always allow" that expires after a period.** It keeps rules current at the cost of a renewal
  prompt and the risk of a surprise lapse.
- **Approvals one at a time only.** Every queued proposal takes its own answer.
- **"Approve all" for every item behind one passkey check.** It saves taps when several purchases
  queue, and hides each one in the batch.
