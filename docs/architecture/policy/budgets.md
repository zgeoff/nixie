# Budgets

A budget limits how much one kind of spending may cost in a period. nixie charges a budget before a
paid tool call or a purchase goes out, so a loop or a runaway task stops at the limit. The
[budgets module](../../../modules/budgets/) owns the ledger. The [policy](rules.md) module parses
the budget files and the `lift` field of a rule, and [the decision point](decision-point.md) passes
a purchase that a lift covers. Model spending has its own limits in
[the spending stop](spending-stop.md). The [budgets design](../../design/platform/policy/budgets.md)
holds the parts not built yet.

## The budget format

A budget file under `budgets/` in the definitions maps each budget ID to its budget. An ID is a slug
such as `shopping-month`, and it belongs to one budget across every file; a repeated ID refuses the
seed and names both files. The definitions read budgets from format 5, as
[the definitions format](../core/definitions.md#the-definitions-format) describes.

| Field    | Holds                                                         |
| -------- | ------------------------------------------------------------- |
| `counts` | `spend`, or `tool:<name>` for the calls of one paid tool      |
| `limit`  | The most the budget allows in one period, in dollars, above 0 |
| `period` | `day`, `week` or `month`                                      |

The parser converts the limit to whole micros (millionths of a dollar) once, with
`Math.round(dollars * 1_000_000)`, and the ledger holds integers only. Each release publishes the
format as the JSON Schema `definitions-budgets.schema.json`, generated from the schema the parser
uses. `bun run --cwd modules/policy rules-schema` rewrites it with the rules schema, and a test
fails while the committed file differs. The release assets do not include it yet.

A period starts at local midnight in the time tool's default zone: a day at each midnight, a week on
Monday and a month on the first. The refusal text and the client show the next start as the reset.

## Budgets in force

The seed compares each budget with the one in force, as it does for a rule, and applies each edit at
once, as [rules in force](rules.md#rules-in-force) explains. The seed record lists each edit with
its class:

- A new budget, a removed budget and a lower limit narrow.
- A higher limit, or a changed period or counts, widens the budget.
- A budget that raises the built-in limit of a paid tool widens too.

The `budgets_in_force` table holds each budget with its limit in micros, its hash and the sequence
of its last change. The seed record holds the repo's budgets. A log reset keeps the table, as it
keeps the rule store.

## The ledger

Two record kinds on no thread write the ledger: `budget.charged` names the budget, the start of its
period, the amount in micros and what the charge is for, and `budget.credited` gives one charge
back. A charge is for a tool call or for an action. The `budget_charges` projection keeps one row
per charge and marks a credited one, and the `budget_ledger` projection keeps the spent micros of
each budget in each period. A credit changes the ledger once, so a retried transaction never gives
the money back twice.

A charge names every budget it touches and lands in one transaction, or does not land. The writer is
the only writer, so two charges at the same moment never both fit in the last of a budget. A charge
that does not fit returns the first budget without room, with what it spent, its limit and its
reset.

## Paid tools

A tool that costs money for each call sets `paid: { priceMicros }` in its definition, and runs
direct. `priceMicros` is a number, or a function of the input for a tool whose price depends on it.
The tool's `check` can refuse the call first, and a refused call charges nothing. Each paid tool has
the built-in budgets `<tool>-day` at $5 and `<tool>-month` at $50, and a budget in the definitions
with the same ID replaces one. A [voice call](../channels/calls.md#price-and-budget) charges the
same way, per minute, against `call-day` and `call-month` at the default limits. `image.draw` has
its own limits: `image.draw-day` at $2 and `image.draw-month` at $20, and its cost never counts
toward the spending stop. `run-tool-call` charges both in one transaction before the provider sees
the call:

- At the limit, the call returns `budget reached: search-day ($5.00 of $5.00). Resets at midnight.`
  to the model, and nothing else is written.
- A tool that answers with an error, or with a refusal code, did not spend, so its charges are
  credited. An error that sets `billed`, because the provider answered before the error, keeps its
  charges.
- A tool that throws leaves an unknown outcome, so its charges stand.

A paid tool can also set a call cap, a limit on the count of its calls, such as the search tool's
[daily call cap](../connectors/search.md#the-daily-call-cap). The charge's write transaction first
checks the cap, then charges both budgets, then counts the call, so a call passes both limits or
neither. When both are full, the cap's refusal wins. A call that is counted stays counted when the
tool errors, because nothing credits the count.

The same charge runs for a call the user approved. The [client](../channels/client.md) shows the
last refusal in a notice beside the spending-stop notice.

## Lifts

A lift lets one allow rule pass purchases that [stage 4](decision-point.md#the-stages) otherwise
asks about. The rule's `lift` field holds `perAction`, the most one purchase may cost in dollars,
and `budget`, the ID of a budget that counts `spend`. The parser refuses a lift on an ask or a deny,
a budget no file defines and a budget that does not count `spend`.

Stage 4 reads the amount from the tool's declared `amount` argument. A purchase passes when it has
the `spend` effect and no other always-ask effect, and its amount is above 0 and at most
`perAction`. When several lifts cover the call, the lowest rule ID wins. The decision records the
rule, the budget and the amount in micros. A lift passes only stage 4, so the later stages still
apply to the call.

The charge happens at the queue, not at the decision. `createAllowedAction` charges the lift's
budget in the transaction that writes `action.queued`, for that action. When the charge does not
land, the queue writes no action. The call instead becomes an always-ask proposal whose record holds
the sentence that names the budget and its reset, and the model hears that the call waits for
approval.

A charge goes back in the transaction that settles the action without a purchase:

- A failed action credits it, whatever wrote the failure: a refusal, a rule deny, a held action the
  user declined or let lapse, or an unknown outcome the user dropped.
- A Stop that cancels the action before an attempt credits it in the Stop's transaction.
- An unknown outcome stays charged until the user settles it.

A purchase that the user approved is not charged, because the approval already answered the
question.

## Changing a lift or a budget

Adding a lift, raising its `perAction` or pointing it at another budget widens the rule, by
[the widening check](rules.md#the-widening-check). Removing a lift or lowering `perAction` narrows.
A widening made inside nixie, such as an edited proposed rule or a mandate, asks for approval in the
lifting risk class, and so does a rule that names an always-ask effect. A widening from the
definitions repo applies at the next seed and skips that class.

## Commands

`nixie budgets list` prints each budget with its counts, limit, period, what its period has spent
and its reset, as JSON. `nixie budgets ledger <budget_id>` prints the charges of one budget in its
period, with what each is for and whether it was credited, and fails for an ID that no budget
defines. Both are [host commands](../deployment/host-commands.md#budgets).
