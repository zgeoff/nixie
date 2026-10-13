# 0043: Budgets for paid tools

- Date: 2026-10-11
- Status: decided
- Design: [budgets](../design/platform/policy/budgets.md)

Each paid tool has its own budget, such as Kagi search from [0014](0014-search.md). A paid tool is a
tool that costs money for each call without the `spend` effect. It states its price per call, and
its budget defaults to $5 a day and $50 a month, which the deployment configuration overrides.

nixie charges the tool's budget before the call and credits back a call that fails. At the limit,
the tool returns "budget reached" to the model, and nixie sends you a push. Raising a tool budget is
a `budget_raise`, which always asks and takes the passkey check from
[0012](0012-high-risk-approvals.md). A paid tool gets its budget in the same change that builds the
tool.

## Why

- A search costs about $0.012 a call and lacks the `spend` effect, so no other limit counts it.
- A charge before the call works like the spending ledger, so 2 calls at once cannot both fit under
  the last of a budget.
- Normal use is about $0.60 a day, so the defaults catch a fault and leave normal work alone.

## Alternatives

- **Paid tools inside the model dollar limits.** It needs fewer parts. On a subscription, model
  dollars are notional and tool dollars are real, so mixing them makes both numbers hard to read.
- **No budget.** It relies on turn limits and on any limit the tool's provider sets. A loop can then
  spend tens of dollars a day without a notice to you.
