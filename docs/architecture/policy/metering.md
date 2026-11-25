# Metering

nixie counts what it spends against a day, a month, a week or a budget, in three kinds of count: the
model gateway's count of model dollars on each route, the ledger of every other money count, and the
turn count. Three parts keep those counts agreeing with each other: one helper that says when each
period starts, one source for each price, and one table that holds the money counts nixie writes.
[The model gateway](model-gateway.md) and [the spending stop](spending-stop.md) cover the gateway's
own count and the limit of each route, and [budgets](budgets.md) covers what a budget charge
refuses.

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
| a model's tokens       | the profile's `prices`                                        | dollars per million tokens   |
| a search               | `search.price_micros` in the server config, 12,000 by default | micros of a dollar per call  |
| a picture of each size | `images.profiles.<id>.prices`                                 | micros of a dollar per image |

A search provider sets no price. The search tool charges `search.price_micros` to its budgets and
records the same value as the call's cost, so the charge and the record never differ. A changed
price applies to the calls after the process that holds it reads it. A turn record and a session
summary record hold the dollars of their tokens at the profile's prices when the record was written,
and the task's dollar meter sums those dollars, so a changed price never reprices them. A record
without dollars prices through the profile's table when the meter reads it.

A profile that a task, a selectable model or the worker role runs on needs `prices`, with a gateway
or without. The task's dollar limit counts each call by the profile's prices, because the task
runner stops a task at its limit itself. The gateway's own count of a route uses the prices in the
gateway's config.

## The spend ledger

The `spend_ledger` table holds the money counts that nixie writes, one row per counter, unit and
period. A row's `ledger_key` joins the four, such as `budget:search-day|micros:USD|day|2026-10-16`.
The row's `amount` is an integer. The `budget.charged` and `budget.credited` records on no thread
write the ledger, through a projection, so a rebuild from the records reproduces every row.

A budget charge adds its amount to the row of its key, and a credit subtracts from the row its
charge added to. The charge record names its `ledgerKey`, and the `budget_charges` projection keeps
it, so a credit lands on the charge's row even when the budget's period has changed since. A charge
recorded before the ledger names no key, so its key takes the period kind that the migration kept
for it in `legacy_charge_kinds`: the kind of the budget in force then, or the kind its ID ends with
for a built-in budget that no row holds. A rebuild reads the kept kind, so a budget that changes its
period afterwards never moves the charge to another key.

A task run's row, `task_run:<ID>`, and a worker run's row, `worker_run:<ID>`, sit under the period
`none` and are set to the run's dollars in micros, rounded up, by the record that ends the run:
`task.run_ended` for a task run, and `worker.run_ended` for a worker run, whose row in tokens is set
too. A run ends once, so its record sets the row and never adds to it, and a rebuild reproduces it.
The ledger reads only the run's ID and what it used from those records.

A charge reads the budget's row, compares it with the limit, and writes its record in one
transaction, so the ledger row and the record that causes it commit together or not at all. Only the
log writer writes, so two charges never both fit in the last of a budget.

A migration replaces the `budget_ledger` table with `spend_ledger`: it copies each amount into a row
with its key, and gives each earlier charge its key.

## The display currency

With `display.currency` in the server config, such as `AUD`, the server reads the rate of one US
dollar in that currency once a day and keeps the last rate it read. `display.rates_url` sets the
rate source's base URL, which is the Frankfurter API by default. A read that fails or gives no rate
keeps the last rate, and logs `spend.rate_read_failed`. Until a read gives a rate, `spend.counts`
names no display, and the client shows US dollars alone. Counts and limits stay in US dollars, and
the model never reads a rate or a dollar figure.

## What counts where

| Spend        | The gateway's count                | The ledger                                                                         |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| a model call | the day and the month of its route | a task run's calls: `task_run`; a worker run's: `worker_run`; a conversation's: no |
| a search     | no                                 | `budget:search-day`, `budget:search-month`                                         |
| a picture    | no                                 | `budget:image.draw-day`, `budget:image.draw-month`                                 |

The gateway limits each route on its own, and no limit spans routes. The spending stop reads the
gateway's counts of the routes and the turn count: a route at its limit holds only its own work, and
the turn count stops nixie. A paid tool counts against its budget and never against the stop, so
model dollars on a plan stay notional while tool dollars are real. The daily search call count in
`search_calls` and the turn count stay in their own tables, because each counts calls or turns and
its limit reads that table.
