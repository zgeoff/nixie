# Budgets, lifts and the spending stop

- Status: Proposed
- Decisions: [0005](../../decisions/0005-effects-and-taint.md),
  [0012](../../decisions/0012-high-risk-approvals.md),
  [0023](../../decisions/0023-lifting-always-ask.md),
  [0026](../../decisions/0026-where-workers-and-the-conversation-run.md)

nixie spends money in 2 ways, and keeps them apart. Spending in the world, such as a purchase, is a
tool call with the `spend` effect, which is always-ask under
[0005](../../decisions/0005-effects-and-taint.md) unless a lifting rule with a budget covers it. The
model's own cost is what nixie pays its model provider for each turn, which budgets per job and a
hard spending stop limit. A budget is one kind of record for both: a limit over a period, and
raising one is always-ask. Everything in this doc beyond the decisions it links is a proposal.

## Budgets

A budget holds an ID, what it counts, a limit, a period and a scope:

| Field  | Holds                                                              |
| ------ | ------------------------------------------------------------------ |
| ID     | A stable slug, such as `shopping-month`                            |
| Counts | Spending through `spend` tools, or model cost                      |
| Limit  | An amount in the owner's currency                                  |
| Period | A day, a week or a month, reset at local midnight on its first day |
| Scope  | The whole deployment, one job, or the lifting rules that name it   |

The limit is definition data, inside the snapshot hash from [rules](./rules.md#the-snapshot-hash),
and the spent amount is state in a ledger projection, which every charge updates in the same
transaction as its record. Raising a limit is `budget_raise`, which is always-ask; lowering it is
`budget_lower`, which applies at once with undo.

## Lifting rules

A lifting rule is an allow rule with a `lift` field, under
[0023](../../decisions/0023-lifting-always-ask.md), such as "spend up to $20 per purchase and $100
per month at these merchants". It lifts the always-ask set for the calls it matches, within its
bounds.

- **The bounds are a budget.** A lift holds a per-action cap and the ID of a budget, and stage 4 of
  the [decision point](./decision-point.md#the-pipeline) passes a call only when its amount is at
  most the cap and the budget has room for it. A lift with no budget is invalid, so "spend freely"
  cannot be written.
- **Only `spend` can be lifted in the first build.** A lift on `policy_widen` would let nixie widen
  its own rules, and a lift on `budget_raise` is the same as a higher budget, so neither shape is
  needed yet. A deployment that wants one gets it as a later design, under the same 3 guards.
- **Creating or widening a lift is always-ask,** with the lifting class from
  [approvals](./approvals.md#risk-class), and the passkey check once
  [0012](../../decisions/0012-high-risk-approvals.md) lands. Lowering its cap or removing it
  narrows.
- **The record names who proposed it,** the owner or nixie from a task.

A lifted call still passes the destination limits: a lift's destinations name the merchants it
covers, and a merchant outside them asks. In the prototype, a lift of $20 per purchase within $100 a
month allowed 4 purchases, asked once for a $30 purchase, and asked again when the month's budget
ran out.

A charge reaches the ledger when the outside action queues, before the provider call, and a failed
action credits it back. **Why:** charging at queue time means 2 purchases queued together cannot
both fit under the last of a budget, and an unknown outcome stays charged until the owner settles
it.

## Model cost

Every turn reports its estimated cost in the Agent SDK's result, which the runner records on the
turn's record. Model cost has 3 limits, each a default the owner can change:

- **Per worker run:** $1, with 10 min and 25 turns, which [tasks](../core/tasks.md#workers) sets.
  The runner passes the cap to the SDK as `maxBudgetUsd`, which ends the query with an
  `error_max_budget_usd` result on `@anthropic-ai/claude-agent-sdk` 0.3.292.
- **Per job run:** $2 by default, counted over every turn and worker in the run. The runner checks
  it before each step and stops the run with a report when it is spent.
- **Per deployment:** a daily and a monthly budget, $10 and $150 by default, which feed the hard
  spending stop below.

**Why:** a narrow worker past $1 is looping, a job run that costs more than a few dollars needs the
owner's eyes, and the deployment limits stop a fault that every smaller limit misses, such as a job
that runs too often.

## The hard spending stop

The hard spending stop ends all model spending once a deployment budget is spent, which the
[scope](../../scope.md) requires in tier 1. When it trips, nixie stops starting turns, pauses every
task in place with a record, and tells the owner through the push channel, which needs no model. The
owner resumes by raising the budget, an always-ask approval, or by waiting for the next period.

The SDK's `maxBudgetUsd` cannot be the hard stop. It is an estimate that the SDK enforces inside the
process that runs the model loop, and under
[0026](../../decisions/0026-where-workers-and-the-conversation-run.md) that process runs in an imp
next to code that reads untrusted content. The runner's checks between steps run on the host, and
each lets one turn overshoot. The hard stop therefore sits on the host, on the route every model
request takes, or with the provider. Where exactly is a decision for the owner in the
[decision point](./decision-point.md#decisions-for-the-owner).
