# Metering

nixie counts what it spends against a day, a month, a week or a budget, in three kinds of count: the
model gateway's count of model dollars, the ledger of every other money count, and the turn count.
Three parts keep those counts agreeing with each other: one helper that says when each period
starts, one source for each price, and one table that holds the money counts nixie writes.
[The model gateway](model-gateway.md) and [the spending stop](spending-stop.md) cover the gateway's
own count, and [budgets](budgets.md) covers what a budget charge refuses.

## Periods

Every counter that resets takes its period from `periodOf` in `libs/periods`, which the server and
the model gateway both import. `periodOf(kind, nowMs, zone)` returns the period of that kind that
holds the instant:

| Kind    | Starts                          |
| ------- | ------------------------------- |
| `day`   | at local midnight               |
| `week`  | at local midnight on Monday     |
| `month` | at local midnight on the 1st    |
| `none`  | never; the counter never resets |

A period holds its `start` as a local date, its `startsAtMs` and its `endsAtMs`, which is `null` for
`none`. A clock change makes a day shorter or longer by its shift, because the next period starts at
the next local midnight, however far on that is. A counter that reads a zone reads the time tool's
`default_zone`, so the gateway's day, a budget's day and the turn count's day start at the same
instant. The server checks at start that `periods.zone` of a gateway equals that zone.

The turn count keeps its turns in buckets of a fixed length, and a day in a zone adds up from whole
buckets only when the zone's offset from UTC is a multiple of that length. The time tool's config
therefore refuses a `default_zone` whose offset, in winter or in summer, is not such a multiple.

## Prices

Each price has one source, and a recorded call keeps the price it was charged:

| Price                  | Source                                                        | Unit                         |
| ---------------------- | ------------------------------------------------------------- | ---------------------------- |
| a model's tokens       | the profile's `prices`, when no gateway runs                  | dollars per million tokens   |
| a search               | `search.price_micros` in the server config, 12,000 by default | micros of a dollar per call  |
| a picture of each size | `images.profiles.<id>.prices`                                 | micros of a dollar per image |

A search provider sets no price. The search tool charges `search.price_micros` to its budgets and
records the same value as the call's cost, so the charge and the record never differ. A changed
price applies to the calls after the process that holds it reads it.

When a gateway runs, which is when the config has a `spendStop` section, each route's `prices` in
the gateway's config is the one source of a model's prices, and a profile sets none. The config
fails to load when a profile sets `prices` beside a gateway, and the error names the route's
`prices`. Without a gateway, a profile that a task, a selectable model or the worker role runs on
needs `prices`, because nixie then prices each call itself and counts it against the task's dollar
limit.

## The spend ledger

The `spend_ledger` table holds the money counts that nixie writes, one row per counter, unit and
period. A row's `ledger_key` joins the four, such as `budget:search-day|micros:USD|day|2026-10-16`.
The row's `amount` is an integer. The `budget.charged` and `budget.credited` records on no thread
write the ledger, through a projection, so a rebuild from the records reproduces every row.

A budget charge adds its amount to the row of its key, and a credit subtracts from the row its
charge added to. The charge record names its `ledgerKey`, and the `budget_charges` projection keeps
it, so a credit lands on the charge's row even when the budget's period has changed since. A charge
recorded before the ledger names no key, so its key takes the period kind of the budget in force at
the charge's sequence, or the kind its ID ends with for a built-in budget.

A charge reads the budget's row, compares it with the limit, and writes its record in one
transaction, so the ledger row and the record that causes it commit together or not at all. Only the
log writer writes, so two charges never both fit in the last of a budget.

A migration replaces the `budget_ledger` table with `spend_ledger`: it copies each amount into a row
with its key, and gives each earlier charge its key.

## What counts where

| Spend           | The gateway's count       | The ledger                                         |
| --------------- | ------------------------- | -------------------------------------------------- |
| a model call    | its route's day and month | no                                                 |
| a search        | no                        | `budget:search-day`, `budget:search-month`         |
| a picture       | no                        | `budget:image.draw-day`, `budget:image.draw-month` |
| a card purchase | no                        | `budget:card-<account>`                            |

The spending stop reads the gateway's counts and the turn count. A paid tool counts against its
budget and never against the stop, so model dollars on a plan stay notional while tool dollars are
real. The daily search call count in `search_calls` and the turn count stay in their own tables,
because each counts calls or turns and its limit reads that table.
