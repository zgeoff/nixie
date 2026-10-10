# Budgets

- Decisions: [0005](../../decisions/0005-effects-and-taint.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0023](../../decisions/0023-lifting-always-ask.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md),
  [0028](../../decisions/0028-policy-design.md)

nixie spends money in 2 ways and keeps them apart. Spending in the world, such as a purchase, is a
tool call with the `spend` effect, which always asks unless a lifting rule covers it. Model cost is
what nixie pays its model provider for each turn, which budgets per job and a hard spending stop
limit. A budget is one kind of record for both: a limit over a period, and raising one always asks.

## Budgets

| Field  | Holds                                                              |
| ------ | ------------------------------------------------------------------ |
| ID     | A stable slug, such as `shopping-month`                            |
| Counts | Spending through `spend` tools, or model cost                      |
| Limit  | An amount in your currency                                         |
| Period | A day, a week or a month, reset at local midnight on its first day |
| Scope  | The whole deployment, one job, or the lifting rules that name it   |

The limit is definition data inside the [snapshot hash](./rules.md#the-snapshot-hash). The spent
amount is state in a ledger projection, which every charge updates in the same transaction as its
record. Raising a limit is `budget_raise`, which always asks; lowering it is `budget_lower`, which
applies at once with undo.

## Lifting rules

A lifting rule is an allow rule with a `lift` field, such as "spend up to $20 per purchase and $100
per month at these merchants". It lifts the always-ask set for the calls it matches, within its
bounds:

- **The bounds are a budget.** A lift holds a per-action cap and a budget ID, and stage 4 of the
  [decision point](./decision-point.md#the-pipeline) passes a call only when its amount is at most
  the cap and the budget has room. A lift with no budget is invalid, so "spend freely" cannot be
  written.
- **The first build ships lifts for `spend`.** A lift on `policy_widen` or `budget_raise` counts
  occurrences per period, such as "nixie may add 2 allow rules a week for read-only tools", and gets
  its form when you first ask for one. A lift can never create another lift.
- **Creating or widening a lift always asks,** in the lifting risk class, with the passkey check
  once [0012](../../decisions/0012-high-risk-approvals.md) ships. Lowering its cap or removing it
  narrows.
- **The record names who proposed it:** you, or nixie from a task.

A lifted call still passes the destination limits: a lift's destinations name the merchants it
covers, and a merchant outside them asks.

A charge reaches the ledger when the action queues, before the provider call, and a failed action
credits it back. **Why:** 2 purchases queued together cannot both fit under the last of a budget,
and an unknown outcome stays charged until you settle it.

## Model cost

Every turn reports its estimated cost in the Agent SDK's result, and the runner records it on the
turn's record. Model cost has 3 limits:

- **Per worker run:** $1, with 10 min and 25 turns. The runner passes the cap to the SDK as
  `maxBudgetUsd`.
- **Per job run:** $2, counted over every turn and worker in the job run. The runner checks it
  before each step and stops the job run with a report when it is spent.
- **Per deployment:** $10 a day and $150 a month, which feed the hard spending stop.

Every value is a placeholder until real use sets it. How to count cost on a subscription token is
open, because the SDK reports a notional price per turn even on a flat subscription; the
[open items](../open-items.md) track it. **Why:** a narrow worker past its cap is looping, a job run
past a few dollars needs your eyes, and the deployment limits stop a fault that every smaller limit
misses, such as a job that runs too often.

## The hard spending stop

The hard spending stop ends all model spending once a deployment budget is spent. When it trips,
nixie stops starting turns, pauses every task in place with a record, and tells you through the push
channel, which needs no model. You resume by raising the budget, which always asks, or by waiting
for the next period.

The stop is a counting proxy on the host. Every model request passes through it, it counts the cost
from each response, and once a deployment budget is spent it refuses further requests. It fails
closed, so a proxy that is down stops turns instead of letting them run uncounted. A spend limit set
with the model provider, where one exists, backs it up. **Why:** the SDK's `maxBudgetUsd` runs
inside the imp, next to code that reads untrusted content, and the runner's checks between steps let
one turn overshoot, so the stop sits on the host route that every model request takes. The proxy
relies on imp's broker to forward a worker's model requests through it, which a spike in
[open items](../open-items.md) checks.
