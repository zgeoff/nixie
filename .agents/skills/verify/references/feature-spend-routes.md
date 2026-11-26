# spend-routes

Contents: [Journey](#journey), [End state](#end-state).

The spending gateway counts each model reply on its own route and on the route's provider, in US
dollars, with a day limit and a month limit per provider and an optional pair per route. A route, or
the provider of a route, at its day limit refuses requests with `limit_reached` and names the route
and the provider, while a turn on a route of another provider completes. The spending page,
`/spend`, lists each provider with its routes, and each count and limit in US dollars, with an
approximate amount in the display currency beside each figure. Each count has a Reset button, and a
provider at its day limit offers a raise.

Run this journey on `local` only, on an `up` of its own:

- On `local`, run `NIXIE_VERIFY_SPEND=1 bun verify up`. It starts a test build of nixie with a
  scripted model behind a spending gateway that has 2 providers and 2 routes, and a double of the
  rate source that gives 1.52 Australian dollars for one US dollar. The conversation runs on the
  route `scripted`, which is on the provider `test`. `scripted` has a day limit of 100 dollars and a
  month limit of 1,000 dollars, and `test` has a day limit of 10,000 dollars and a month limit of
  100,000 dollars. The route `second` has no limit of its own and is on the provider `reserve`,
  which has a day limit of 1.50 dollars and a month limit of 50 dollars.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Before you start:

- Run `NIXIE_VERIFY_SPEND=1 bun verify up --restart` and `bun verify doctor`, then
  [sign-in-enrol](feature-sign-in-enrol.md).

## Journey

1. Record every later command of this journey under this feature. Then send a request to the route
   `second` twice. The first reply costs 2 dollars, which passes the day limit of 1.50 dollars of
   the provider `reserve`:

   ```bash
   bun verify use --feature spend-routes
   bun verify action probe-route --route second
   bun verify action probe-route --route second
   ```

   Expect: the first `data` is `{"status":200,"error":null}`. The second `data` is
   `{"status":403,"error":{"type":"limit_reached","counter":"provider_day","route":"second","provider":"reserve"}}`.

2. With the route `second` at its limit, run a turn on the route `scripted`. Its reply reports
   125,000 output tokens, which the gateway prices at 0.50 dollars:

   ```bash
   bun verify action script-reply --text 'The heron left the pond at dawn.' --output-tokens 125000
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Where did the heron go?'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Where did the heron go?' --reply 'The heron left the pond at dawn.'
   ```

   Expect: `conversation turn` exits 0, so the turn completed on `scripted` while the provider
   `reserve` was stopped.

3. Read the spending page, then raise the day limit of the provider `reserve` to the amount that the
   offer proposes, and probe the route again. Before the raise, the provider refuses the route:

   ```bash
   bun verify browser goto /spend
   bun verify browser snapshot
   bun verify browser click --role button --name 'Raise the day limit of provider reserve'
   bun verify browser click --role button --name 'Confirm raise of provider reserve'
   bun verify browser snapshot
   bun verify action probe-route --route second
   ```

   Expect: the probe's `data` is `{"status":200,"error":null}`, so the new limit took effect. Read
   the first snapshot for the end state's counts, and the second for the raised limit.

4. The probe of step 3 cost 2 dollars more, which passes the raised limit. Reset the day count of
   the provider `reserve` with one confirm, and probe the route again:

   ```bash
   bun verify browser click --role button --name 'Reset today for provider reserve'
   bun verify browser click --role button --name 'Confirm reset today for provider reserve'
   bun verify browser snapshot
   bun verify action probe-route --route second
   ```

   Expect: the probe's `data` is `{"status":200,"error":null}`. Read the snapshot for the reset.

5. Start a task on the route `scripted`, and read the dollars of its task run. The gateway counts
   the task's sandbox, so the task run's dollars are that count, which the task meter writes:

   ```bash
   bun verify action script-reply --text 'I started the tide tables.' --task '{"name":"Tide tables","brief":"Write down the tides.","reply":"Tides noted."}'
   bun verify browser goto /
   bun verify browser type --role textbox --name Message --value 'Start a task that writes down the tides.'
   bun verify browser click --role button --name Send
   bun verify conversation turn --message 'Start a task that writes down the tides.' --reply 'I started the tide tables.'
   bun verify task --name 'Tide tables' --state waiting --record task.step_committed
   bun verify db query "select json_extract(payload, '$.reason') as reason, json_extract(payload, '$.countMicros') as micros from records where kind = 'task.meter_read' order by sequence"
   bun verify db query "select counter, amount from spend_ledger where counter like 'task_run:%'"
   ```

   Expect: `task` exits 0, and on exit 1 run it again, up to 5 runs in all.

## End state

- Under the heading "Provider test", the page reads "Today: $0.50 (about A$0.76) of $10,000.00
  (about A$15,200)" and "This month: $0.50 (about A$0.76) of $100,000.00 (about A$152,000)". Under
  it, the heading "scripted" reads "Today: $0.50 (about A$0.76) of $100.00 (about A$152)" and "This
  month: $0.50 (about A$0.76) of $1,000.00 (about A$1,520)". Fail the journey when a count reads
  $0.00, because the reply was not counted.
- Under the heading "Provider reserve", the page reads "Today: $2.00 (about A$3.04) of $1.50 (about
  A$2.28) (limit reached)" and "This month: $2.00 (about A$3.04) of $50.00 (about A$76)". Its route
  `second` sits under it, and reads "$2.00 (about A$3.04) no limit of its own" on both lines. Each
  count has a Reset button.
- After the raise, the second snapshot of step 3 reads "Today: $2.00 (about A$3.04) of $2.25 (about
  A$3.42)" under "Provider reserve", with no "(limit reached)", and the probe of `second` is
  answered with status 200.
- After the reset, the snapshot of step 4 reads "Today: $0.00 (about A$0.00) of $2.25 (about
  A$3.42)" under "Provider reserve", and the probe of `second` is answered with status 200.
- The page says that the figures in Australian dollars are approximate.
- The first query shows a `run_start` read of 0 and a `step_end` read above 0, in that order. The
  second shows one row, whose `amount` equals the `step_end` micros, so the task run's dollars are
  the gateway's count of its sandbox.
