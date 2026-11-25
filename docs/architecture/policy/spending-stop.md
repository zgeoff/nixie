# The spending stop

The spending stop starts no new model spending once the turn limit is reached, and holds the work on
each route that reached its own dollar limit. It builds on the [model gateway](model-gateway.md),
which counts each route's dollars, and adds the count of turns, the pause, the raise and the notice.
A deployment whose config has no `spendStop` has none of it: no spend module context, no watcher and
no check before a turn. [Budgets](budgets.md) cover the limits on tool calls and purchases.

## What stops

The stop of nixie stands in one of 4 states, which `readSpendStop` in `modules/spend` works out from
the gateway's `/status` and the turn count:

| State         | When                                                                                                                  | Clears                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `tripped`     | a day or month limit in turns is reached                                                                              | at the period's reset, or when a raise lifts the day limit |
| `unreachable` | the gateway has not answered for the watcher's no-answer time, or not since the start                                 | at the gateway's first answer                              |
| `lost`        | the gateway's count is lost: a count failed to write, or a reply with an input the estimate cannot bound had no usage | when an operator removes the lost mark from the store      |
| `clear`       | none of the above                                                                                                     |                                                            |

A route that reaches its day or month limit in dollars never stops nixie as a whole.
[The stop of a route](#the-stop-of-a-route) holds only the work on that route, and every other route
goes on.

The turn count has its own table, `spend_turns`, in UTC buckets. It adds one turn for each
`model.turn_ended` and each `worker.turn_ended` record, and no call writes both. A limit is a total:
the limit in force is the larger of the config's limit and the raise's total.

The server counts each turn record that no fold counted at each start, before any work, from the
last sequence it counted, which `spend_turns_folded` holds. The first start after the upgrade counts
every turn the log holds, and a start after a rollback counts the turns the release before wrote.
The migration only adds tables, so that rollback needs no restore.

## The stop of a route

The gateway counts each route's day and month in dollars and limits each route on its own, as
[the periods](model-gateway.md#the-periods) describe. The watcher's poll of `/status` settles each
route's stop beside the stop of nixie, in the same transaction. A route whose day or month shows
`tripped` has a row in `spend_route_stops`. When both periods tripped, the row holds the day.

- A new trip writes `spend.route_stopped`, with the route, its period and its limit. That record is
  the one notice to the user, and a later poll that finds the same stop writes none.
- A route that is no longer tripped writes `spend.route_cleared` with the reason `reset` or
  `raised`. A route that stays tripped at another limit or period, such as when a raise leaves it
  over its day limit, or when the day ends and the month still binds, writes `spend.route_restated`
  instead. That record replaces the row, sends no notice, and keeps the holds.
- Each read of the facts takes the next place in line before it asks the gateway, and a raise takes
  its place before its first request. A settle whose place is no later than the last settle's writes
  nothing. A settle that writes marks every place taken so far as settled, because a read still in
  flight may hold a status from before a raise that this settle carried. That read writes nothing,
  and the next poll catches up. So a late answer never puts back a stop that a raise cleared, even
  when both read in the same millisecond. A settle that rolls back gives its place back.
- The stop of nixie takes no place in line. Each settle reads the clock, the turn count and the
  raise again inside its transaction, and counts the day the clock is in then. So facts read before
  a raise of turns, or before midnight, never put back the stop that the raise or the reset cleared.
  The check before a turn does the same before it writes a trip.
- A trip whose period has ended at the instant before the gateway answered is no trip, and an ended
  day never hides a month that still binds. A raise settles with the instant before its own request,
  so midnight during the raise does not expire the status that the request returned.
- A gateway that did not answer changes no route's stop. The stop of nixie covers it.

A task that a refusal or a stopped route held has a row in `spend_route_holds`. A step holds its
task on the route of its profile in 2 places: before its model turn, when the route's stop stands,
and after a failed step, after it reads the gateway and settles the route stops. The
[task gate](../core/pause.md#the-task-gate) reports `spend` for a held task while its route's stop
stands, and the claim filter leaves the task's work unclaimed, so a task on another route runs. A
held step ends at once with no step commit. A failed step counts no step error when a route's stop
explains it, or when the gateway recorded a refusal of the step's sandbox on the step's route after
the step began, which the sandbox's `lastRefusal` holds, though the route has since reset or risen.

A clear writes `spend.wait_notice` on the thread of each task that waited, with a short ID from
`createShortID` in its payload. On its next wake, the model reads about how many minutes the task
waited, under that short ID. The wait notice holds no dollar figure and no route. The read cursor
moves only through an unbroken run of read records, so a notice that falls past the wake's batch, at
the [batch limit or an image cap](../core/conversation-turns.md#inbox-records-as-messages), can't
join that batch. Instead, the turn's opening message carries the notice in the text a batch would
show, under the same short ID. Once the model reads the opening message, the turn end lists each
notice that message carried in `waitNoticesTold`. A later batch that reaches a told notice marks it
read and sends the model no text for it, and the image check before a resumed turn passes over it. A
step whose inbox holds only told notices marks them read and runs no turn, even when the session's
summary fails.

## The watcher

The server's `spend_watcher` part polls `/status` on a fixed interval and settles the stop in one
transaction:

- A trip writes `spend.stop_tripped` and, when nixie is not paused, pauses with the cause
  `spending`. A pause that stands for another cause keeps its cause.
- A clear writes `spend.stop_cleared` and resumes only a pause whose cause is `spending`.
- A raise that the gateway did not answer stays in the log as `spend.limit_raised`, and the watcher
  sends it again until the day ends.
- When the stop it reads, or whether the gateway answers, differs from its last read, the watcher
  calls `publishChanged` with the `spend` topic, so an open client reads `spend.read` again. The
  [live stream](../channels/live-updates.md#topics) carries it, because no write makes that change.
- When the gateway did not answer at the start, the watcher trips the stop as `unreachable` on its
  first poll that finds no answer, and clears it when the gateway answers. A start that finds the
  gateway's lost mark standing logs `spend.gateway_lost`, and the first poll trips the stop as
  `lost`.

The spending pause raises the database's reader gate to the spend migration, so the release before
refuses to open the database while the pause stands. When the pause takes another cause, the gate
drops to that cause's version.

## Before a turn

The stop holds a task through the [task gate](../core/pause.md#the-task-gate): the gate reports
`spend` while the stop's row stands, whatever the pause's cause and the task's exemption, and the
claim filter leaves the task's work unclaimed. The row lives in the log module, so the tasks module
reads it without importing the spend module.

Each conversation step calls `checkSpendTurns` before its model turn, which trips the stop when the
turn count has reached a limit, then reads the task's gate in a read transaction. A step held for
`spend` ends at once with no step commit: the task goes back to ready with its work, its lease
frees, and the next claim waits for the clear. A task step that fails while the stop stands counts
no step error, and its next claim after the resume runs it again. A worker call makes the same two
reads for the task whose step started it, because the gateway counts no turns, and while the stop
stands the call fails with no sandbox started. A turn that is running when the stop trips finishes.

### Plan logins

At each read of the gateway's `/status`, the spend module also reads `GET /chatgpt-logins` and keeps
the answer in memory on the spend context: the route ID of each plan route with its status, account
ID and plan type, or `unreachable` after a failed read. It holds no token and no email, and it is
never written to the database. Before the first read, the held answer is `unreachable`.

A step on a plan profile, a `codex` profile with `chatgpt_login: true`, reads the held answer before
its turn, after the spend check and before any capture opens. The plan profile's ID is the route ID.
The step puts the route's account ID and plan type in the turn profile's `chatgptLogin`. When the
gateway is unreachable, or lists no active login for the profile, the step fails with
`model_auth.chatgpt_login`, which waits for the user, and no turn starts. The web client shows that
the operator runs `model-gateway chatgpt-login`. A worker run on a plan profile reads the held
answer the same way before its turn, and its call fails with the same message. The schema refuses
`chatgpt_login: true` when the config has no `spendStop` section, because the server reaches the
logins through it.

## Resume and raise

While the stop stands, the API refuses `nixie.resume` and a task's resume, whatever the pause's
cause, with the way the stop clears. A pause and a stop of a task work as usual. When the user
pauses nixie while the stop stands, the cause becomes `owner`, and the clear leaves nixie paused.

`spend.read` gives the stop of nixie and each route that stands stopped. `spend.raise` takes the
day's start and either a route with its dollars, the turns, or both, and works for a day trip only.
It calls the gateway's `POST /raise` with the route and its dollars, then writes
`spend.limit_raised` with the session as `by`. A total above a cap, the gateway's for a route's
dollars or the config's for turns, comes back as `above_cap` with the measure, the route and the
cap, and writes nothing. A route the gateway does not hold comes back as `unknown_route`. A raise
made while the gateway gives no status comes back as `unreachable` and writes nothing, and one whose
post to the gateway got no answer comes back as `unanswered`, with its record kept for the watcher
to send again. The client tells the user that an `unanswered` raise is saved and that an
`unreachable` one is not. A raise of a route's dollars never pauses nixie. It clears the route's
stop when the raised limit passes the route's spend, and restates the stop when it does not.

The host command `nixie spend raise --turns <n>` raises the day's turns past the turn cap, and
writes the host as `by`. A route's dollars pass its cap only through the gateway's own `raise`
command, and the month's limits move only in the gateway's config.

`spend.counts` gives each route's day and month count and limit in US dollars, and the display
currency with the rate of one US dollar in it. It reads the gateway's status, so a gateway that does
not answer gives no route. See the [metering doc](metering.md#the-display-currency) for where the
rate comes from.

The web client shows the notice under the pause banner. A turn trip of the day offers "Raise today's
limit" with today's limit plus half, up to the cap, and the amount stays editable until the one
confirm. Each stopped route shows a line with the route's name, its limit in US dollars with the
approximate amount in the display currency, and a note that its work waits. A route that tripped its
day limit, below its cap, also offers "Raise the day limit of" the route, with the day's limit plus
half in US dollars, up to the route's cap, and the amount in the display currency beside the field,
and one confirm sends `spend.raise` with the route and the dollars. A month trip, `unreachable` and
`lost` show no button, and the pause banner offers no resume for the cause `spending`.

The spending page, at `/spend`, lists each route with its day and month count against its limit.
Each figure is in US dollars with the approximate amount in the display currency beside it, such as
"$12.40 (about A$19)". A route with no limit set says that it refuses requests, and a route at a
limit says so. The page reads `spend.counts` on a short interval, because the gateway counts each
reply as it arrives and no live topic reports it.
