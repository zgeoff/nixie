# 0005: Effects and taint

- Date: 2026-10-07
- Status: decided
- Research: [policy model notes](../research/2.3-notes/policy-models.md),
  [approval notes](../research/2.3-notes/approvals.md),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#policy-layers)

Every nixie tool declares its effects, such as read, write, send, spend, or a change to rules,
approvals or budgets. Rules from [0004](./0004-rule-engine.md) match on those effects. 3 effects
always ask the owner, and no rule lifts them:

- spending money
- changing approvals or rules
- changing budgets

Every other effect, deletion and sending to a new recipient included, follows the owner's rules.

A task that reads untrusted content carries a taint label for the rest of the task. A tainted task
asks the owner only before it sends or acts towards a destination it has no standing permission for.
It stays free to reply to the sender it read, to message the owner or people the owner marks as
known, and to write drafts and notes inside nixie. Each source has a trust level: the owner's own
content and mail from known contacts can leave a task untainted, and web pages and unknown senders
taint it.

## Why

- Injected instructions do harm by sending the owner's data somewhere an attacker controls, or by
  acting on someone the attacker picks. Limiting a tainted task's destinations closes that route
  deterministically, without a prompt for every action.
- Tainting every send, write and spend of a tainted task makes ordinary work, such as triaging an
  inbox, ask before each reply.
- Trust levels per source apply the principle that the risk stance is set per context.

## Alternatives

- **No taint layer.** Rules and approvals alone decide each action. An injected instruction is
  stopped only when a rule happens to ask, which breaks the principle that untrusted content cannot
  reach out alone.
- **Taint that closes every send, write and spend.** It gives the strongest protection at the tool
  boundary, and in CaMeL's tests a comparable rule fired on 10 to 30% of harmless tasks.
- **Quarantined readers now.** A separate model call with no tools reads the untrusted content and
  returns a narrow typed answer that does not taint the main task. It is planned for later, not
  first.

## Consequences

- Quarantined readers come later, for patterns such as classifying a message or extracting a date.
  The taint label is designed from the start so that a reader's typed output can carry a weaker
  label than its input.
- A known contact's compromised account bypasses the taint, because its mail can leave a task
  untainted. The owner chooses who is known.
- Side channels remain at the tool boundary: a conditional call, an exception message, or a link
  that a channel renders. imp's network policy is the layer beneath.
