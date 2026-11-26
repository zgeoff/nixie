# Metering

nixie counts what it spends against a day, a month, a week or a budget, in three kinds of count: the
model gateway's count of model dollars on each route, the ledger of every other money count, and the
turn count. Three parts keep those counts agreeing with each other: one helper that gives the start
of each period, one source for each price, and one table that holds the money counts nixie writes.
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
the next local midnight. A counter that reads a zone reads the time tool's `default_zone`, so the
gateway's day, a budget's day and the turn count's day start at the same instant. The server checks
at start that `periods.zone` of a gateway equals that zone.

The turn count keeps its turns in buckets of a fixed length, and a day in a zone adds up from whole
buckets only when the zone's offset from UTC is a multiple of that length. The time tool's config
therefore refuses a `default_zone` whose offset, in winter or in summer, is not such a multiple.

## Prices

Each price that nixie counts has one source in nixie's config:

| Price                  | Source                                                        | Unit                         |
| ---------------------- | ------------------------------------------------------------- | ---------------------------- |
| a model's tokens       | the profile's `prices`                                        | dollars per million tokens   |
| a search               | `search.price_micros` in the server config, 12,000 by default | micros of a dollar per call  |
| a picture of each size | `images.profiles.<id>.prices`                                 | micros of a dollar per image |

A search provider sets no price. The search tool charges `search.price_micros` to its budgets and
records the same value as the call's cost, so the charge and the record never differ. A changed
price applies to the calls after the process that holds it reads it. A turn record and a session
summary record hold the dollars of their tokens at the profile's prices when the record was written.
The task's dollar meter sums those dollars, so a changed price never reprices them. A record written
with no dollars, by a release before records held them, takes the profile's prices in force when the
meter reads it.

Without a gateway, set `prices` on each profile that a task, a selectable model or the worker role
runs on, because the task runner then counts the task's calls itself. With a gateway, set no
`prices` on a profile. The gateway prices each reply with its route's table, and a config file that
sets `prices` on a profile beside a gateway fails to load, with an error that names the profile. The
gateway and the task runner both price a reply with `buildCallCost` from `@heynixie/models/prices`.
Each count converts to whole micros, and never rounds a positive amount to nothing.

## The spend ledger

The `spend_ledger` table holds the money counts that nixie writes, one row per counter, unit, period
kind and period start. A row's `ledger_key` joins the four, such as
`budget:search-day|micros:USD|day|2026-10-16`. The row's `amount` is an integer. A projection writes
the ledger from the `budget.charged` and `budget.credited` records on no thread, so a rebuild from
the records reproduces every row.

A budget charge adds its amount to the row of its key, and a credit subtracts from the row its
charge added to. The charge record holds its `ledgerKey`, and the `budget_charges` projection keeps
it, so a credit lands on the charge's row even when the budget's period has changed since. A charge
recorded before the ledger holds no key. Its key comes from the period kind that the migration kept
for it in `legacy_charge_kinds`. The migration keeps a kind only when the old rows prove it:

- The charge's record comes after the last change of its budget in force, which
  `budgets_in_force.updated_sequence` holds, so the charge took the period now in force.
- The budget is a built-in one, `<tool>-day` or `<tool>-month`, that no seed record ever named, so
  the charge took the period its ID ends with.
- The charge's period start is neither a Monday nor the 1st, so only a day can start there.

Any other charge keeps no kind, gets no key and counts in no row, and its credit changes no row,
because its budget may have changed its period since the charge. A rebuild reads the kept kind, so a
budget that changes its period afterwards never moves the charge to another key.

A task run's row, `task_run:<ID>`, and a worker run's row, `worker_run:<ID>`, sit under the period
`none` and hold the run's dollars in micros, rounded up. A worker run ends once, and
`worker.run_ended` sets its row, with its row in tokens, so a rebuild reproduces it. A task run's
row follows the task run's meter reads, as [the task meter](#the-task-meter) says. A task run that
began before its start record named a meter and has no meter read has its row set by
`task.run_ended`. The ledger reads only the run's ID and what it used from those records.

A charge reads the budget's row, compares it with the limit, and writes its record in one
transaction, so the ledger row and the record that causes it commit together or not at all. A paid
tool's charge commits in the transaction that writes the call's `tool_called` record, and its credit
commits in the transaction that writes the `tool_result` record, so a fault between the two leaves a
call with its charge or with neither, and a result with its credit or with neither. Only the log
writer writes, so two charges never both fit in the last of a budget.

A migration replaces the `budget_ledger` table with `spend_ledger`. It gives each earlier charge its
key when it can, and sets each row to the total of the uncredited charges with that key, as a
rebuild does. A row in a period under way leaves out each charge with no key. The start that runs
the migration logs `spend.ledger_uncounted` once for each budget period of those charges, with the
uncredited total in micros that no row counts.

## The task meter

A task run's dollars are the gateway's count of the sandboxes it used. A task keeps its sandbox
across its task runs, and replaces it when the host loses it. The server reads a sandbox's count
with `GET /sandboxes/<name>` and writes each read as a `task.meter_read` record:

```text
task.meter_read  { taskRunID, sandbox, reason, countMicros }
  reason: 'run_start' | 'step_start' | 'step_end' | 'worker_end' | 'run_end'
```

`countMicros` is the count rounded up to the micro. The task run's start record holds
`meter: 'gateway' | 'records'`, which names who counts the task run's sandboxes.

- A task run's dollars are, for each sandbox it used, the last count less the count at the task
  run's start or at the sandbox's creation, summed, plus the dollars of its worker runs. A sandbox
  that a read first names after the start began at zero. A count only grows, so a read that lands
  late never lowers the sum.
- What a task run has left is its limit less its dollars.
- A `task.meter_read` sets its task run's ledger row to the task run's dollars, in the transaction
  that writes the record, so a fault between the read and its row leaves both or neither. Every
  counter has one writer: the meter reads for a task run that has them, `task.run_ended` for an
  older task run with none, and `worker.run_ended` for a worker run.
- At a task run's start, the server sets the sandbox's limit to its count plus the task run's limit,
  with `PATCH /sandboxes/<name>`. When a worker run starts, the limit drops by the worker run's
  planned limit. When the worker run ends, the planned limit comes back and what the worker run
  spent comes off. A worker run's planned limit is at most what the task run has left after the
  planned limits of the worker runs already going.
- A `task-raise` patches the sandbox's limit after its commit. It retries the patch until the
  gateway takes it, or until a step has read the sandbox again and set its own limit. The next task
  run's start sets the limit too.
- The server reads before a step starts, after a step ends, after each worker run ends and when a
  task run ends. When the read before a step, or the patch that follows it, gets no answer, the step
  does not start and tries again after a wait. When any other read gets no answer, the next read
  catches up. `task.run_ended`, and every record that would end a task run, commits only once each
  sandbox the task run read has its end read. While the gateway gives no answer, nothing of that
  commit lands, and the commit tries again after a wait. A sandbox the gateway no longer holds ends
  at its last count. The server never removes the task's sandbox while a task run is open.
- A `task-raise` patch reads the limit as the log stands before each try, so a late retry never
  lowers a newer limit.
- Every patch of a task's sandbox names the `limitRevision` that the server read just before it, as
  [the count of a sandbox](model-gateway.md#the-count-of-a-sandbox) says. A call that timed out and
  reaches the gateway after a newer patch changes nothing, so it never puts back an older limit.
- When a task run ends, each pass that settles it reads every sandbox again, because a sandbox that
  answered in a pass that then waited for another can spend before the next pass.
- A limit of zero dollars is a valid sandbox limit: the gateway accepts it and refuses every
  request.
- A step whose sandbox refused a request since the step began ends at the task's dollar limit. The
  sandbox's limit stops the turn, so the runner prices no call itself.
- A task run that has no gateway has `meter: 'records'`. The runner prices the guest's call frames
  with the profile's price table, and writes `task.meter_read` at the same points, with its own
  running tally under the task's ID as the sandbox.
- A task run whose start record names no meter began before the meter reads. Behind a gateway, its
  first step writes the dollars its records hold as a read under the task's ID, then reads the
  sandbox, so the task run keeps its spend and counts the gateway's from then on. Without a gateway
  it keeps the meter that priced its turn records until it ends.

Without a gateway, nothing stops model spend outside nixie, and the deployment's provider limit is
the only backstop, as [the spending stop](spending-stop.md) sets out.

## The display currency

With `display.currency` in the server config, such as `AUD`, the server reads the rate of one US
dollar in that currency once a day and keeps the last rate it read. `display.rates_url` sets the
rate source's base URL, which is the Frankfurter API by default. A read that fails or gives no rate
keeps the last rate, and logs `spend.rate_read_failed`. Until a read gives a rate, `spend.counts`
carries no display, and the client shows US dollars alone. Counts and limits stay in US dollars, and
the model never reads a rate or a dollar figure.

## What counts where

| Spend        | The gateway's count                | The ledger                                                                         |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| a model call | the day and the month of its route | a task run's calls: `task_run`; a worker run's: `worker_run`; a conversation's: no |
| a search     | no                                 | `budget:search-day`, `budget:search-month`                                         |
| a picture    | no                                 | `budget:image.draw-day`, `budget:image.draw-month`                                 |

A model reply charges the gateway's count of its route when it arrives. A task run's row follows the
`task.meter_read` records of the task run, and a worker run's row is set when the run ends. A
conversation reply has no row, because the gateway's count of its route is the one place that holds
it.

The gateway limits each route on its own, and no gateway limit spans routes. The spending stop reads
the gateway's counts of the routes and the turn count: a route at its limit holds only its own work,
and the turn count stops nixie. A paid tool counts against its budget and never against the stop,
because model dollars on a plan stay notional while tool dollars are real. The daily search call
count in `search_calls` and the turn count stay in their own tables, because each counts calls or
turns and its limit reads that table.
