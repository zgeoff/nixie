# Budgets

- Decisions: [0005](../../../decisions/0005-effects-and-taint.md),
  [0012](../../../decisions/0012-high-risk-approvals.md),
  [0003](../../../decisions/0003-sdk-placement.md),
  [0028](../../../decisions/0028-policy-design.md),
  [0033](../../../decisions/0033-model-profiles.md),
  [0043](../../../decisions/0043-paid-tool-budgets.md)

nixie spends money in 3 ways and keeps them apart. Spending in the world, such as a purchase, is a
tool call with the `spend` effect, which always asks unless a lifting rule covers it. A paid tool,
such as search, costs money for each call without the `spend` effect, and its own budget limits it.
Model cost is what nixie pays its model provider for each turn, which budgets per job and a hard
spending stop limit. A budget is one kind of record for both: a limit over a period, and raising one
always asks.

## Budgets

| Field  | Holds                                                                                  |
| ------ | -------------------------------------------------------------------------------------- |
| ID     | A stable slug, such as `shopping-month`                                                |
| Counts | Spending through `spend` tools, a paid tool's calls, or model dollars, tokens or turns |
| Limit  | An amount in your currency, a token count or a turn count                              |
| Period | A day, a week or a month, reset at local midnight on its first day                     |
| Scope  | The whole deployment, one job, one paid tool, or the lifting rules that name it        |

The limit is definition data inside the [snapshot hash](rules.md#the-snapshot-hash). The spent
amount is state in a ledger projection, which every charge updates in the same transaction as its
record. Raising a limit is `budget_raise`, which always asks; lowering it is `budget_lower`, which
applies at once with undo.

## Lifting rules

A lifting rule is an allow rule with a `lift` field, such as "spend up to $20 per purchase and $100
per month at these merchants". It lifts the always-ask set for the calls it matches, within its
bounds:

- **The bounds are a budget.** A lift holds a per-action cap and a budget ID, and stage 4 of the
  [decision point](decision-point.md#the-pipeline) passes a call only when its amount is at most the
  cap and the budget has room. A lift with no budget is invalid, so "spend freely" cannot be
  written.
- **The first build ships lifts for `spend`.** A lift on `policy_widen` or `budget_raise` counts
  occurrences per period, such as "nixie may add 2 allow rules a week for read-only tools", and gets
  its form when you first ask for one. A lift can never create another lift.
- **Creating or widening a lift always asks,** in the lifting risk class, with the passkey check
  once [0012](../../../decisions/0012-high-risk-approvals.md) ships. Lowering its cap or removing it
  narrows.
- **The record names who proposed it:** you, or nixie from a task.

A lifted call still passes the destination limits: a lift's destinations name the merchants it
covers, and a merchant outside them asks.

A charge reaches the ledger when the action queues, before the provider call, and a failed action
credits it back. **Why:** 2 purchases queued together cannot both fit under the last of a budget,
and an unknown outcome stays charged until you settle it.

## Paid tools

Each paid tool has a budget scoped to that tool, under
[0043](../../../decisions/0043-paid-tool-budgets.md), and the tool states its price per call. The
default limits are $5 a day and $50 a month, and the deployment configuration overrides them. A paid
tool gets its budget in the same change that builds the tool.

nixie charges the tool's budget when the call starts, before the provider sees it, and credits back
a call that fails, the same way the spending ledger charges a purchase. At the limit, the tool
returns "budget reached" to the model and nixie sends you a push. Raising a tool budget is a
`budget_raise`, which always asks and takes the passkey check. **Why:** model dollars are notional
on a subscription and tool dollars are real, so the tool budget stays apart from the model limits,
and a looping search hits it long before it costs much.

## Model cost

Model use has 3 measures, and each limit below sets all 3: dollars, tokens and turns. The
[counting proxy](#the-hard-spending-stop) counts tokens from each response, and nixie prices them
with the role's [model profile](../core/models.md#cost), never with the cost the Agent SDK reports.
A token count includes input, cache writes, cached input and output. **Why:** dollars bound what a
metered route costs, tokens bound the load on a flat subscription, where dollars are notional, and
turns catch a loop whatever the price.

| Limit          | Dollars | Tokens      | Turns  | Other  |
| -------------- | ------- | ----------- | ------ | ------ |
| Per worker run | $2      | 2,000,000   | 25     | 10 min |
| Per job run    | $5      | 4,000,000   | 100    |        |
| Per day        | $40     | 40,000,000  | 1,000  |        |
| Per month      | $600    | 600,000,000 | 20,000 |        |

- **Per worker run.** The runner passes the turn limit to the SDK as `maxTurns`, and stops the
  worker run when the proxy's dollar or token count for its imp reaches the limit.
- **Per job run.** The count covers every turn and worker in the job run. The runner checks it
  before each step and stops the job run with a report when a limit is reached.
- **Per deployment,** a day and a month. These limits feed the hard spending stop.

Each default is at least about twice the heaviest use the [token use spike](../spikes/turn-tokens/)
measured or projected, because it exists to stop a fault, and the deployment configuration overrides
every value. The conversation sets the deployment limits: each turn re-reads its whole session, so
its tokens grow with the session up to the compaction window. **Why:** a narrow worker past its
limit is looping, a job run past its limit needs your eyes, and the deployment limits stop a fault
that every smaller limit misses, such as a job that runs too often.

## The hard spending stop

The hard spending stop ends all model spending once a deployment limit is reached. When it trips,
nixie stops starting turns, pauses every task in place with a record, and tells you through the push
channel, which needs no model. You resume by raising the budget, which always asks, or by waiting
for the next period.

The stop is a counting proxy on the host. Every model request passes through it, it counts the
tokens and the cost from each response, and once a deployment dollar or token limit is reached it
refuses further requests. The proxy holds one route per model profile, so it prices each response
with that profile's table. The runner counts turns from the turn records and trips the stop at the
deployment turn limit. The proxy fails closed, so a proxy that is down stops turns instead of
letting them run uncounted. A spend limit set with the model provider, where one exists, backs it
up. **Why:** a limit the SDK enforces runs inside the imp, next to code that reads untrusted
content, and the runner's checks between steps let one turn overshoot, so the stop sits on the host
route that every model request takes. The proxy relies on imp's broker to forward a worker's model
requests through it, which a spike in [Linear](https://linear.app/zgeoff/issue/GEO-248) checks.
