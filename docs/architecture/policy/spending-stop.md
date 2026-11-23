# The spending stop

The spending stop ends all model spending once a deployment limit is reached. It builds on the
[model gateway](model-gateway.md), which counts dollars and tokens, and adds the count of turns, the
pause, the raise and the notice. A deployment whose config has no `spendStop` has none of it: no
spend module context, no watcher and no check before a turn. [Budgets](budgets.md) cover the limits
on tool calls and purchases.

## What stops

The stop stands in one of 4 states, which `readSpendStop` in `modules/spend` works out from the
gateway's `/status` and the turn count:

| State         | When                                                                                                                  | Clears                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `tripped`     | a day or month limit in dollars, tokens or turns is reached                                                           | at the period's reset, or when a raise lifts every measure |
| `unreachable` | the gateway has not answered for the watcher's no-answer time, or not since the start                                 | at the gateway's first answer                              |
| `lost`        | the gateway's count is lost: a count failed to write, or a reply with an input the estimate cannot bound had no usage | when an operator removes the lost mark from the store      |
| `clear`       | none of the above                                                                                                     |                                                            |

The turn count has its own table, `spend_turns`, in UTC buckets. It adds one turn for each
`model.turn_ended` and each `worker.turn_ended` record, and no call writes both. A limit is a total:
the limit in force is the larger of the config's limit and the raise's total.

The server counts each turn record that no fold counted at each start, before any work, from the
last sequence it counted, which `spend_turns_folded` holds. The first start after the upgrade counts
every turn the log holds, and a start after a rollback counts the turns the release before wrote.
The migration only adds tables, so that rollback needs no restore.

## The watcher

The server's `spend_watcher` part polls `/status` on a fixed interval and settles the stop in one
transaction:

- A trip writes `spend.stop_tripped` and, when nixie is not paused, pauses with the cause
  `spending`. A pause that stands for another cause keeps its cause.
- A clear writes `spend.stop_cleared` and resumes only a pause whose cause is `spending`.
- A raise that the gateway did not answer stays in the log as `spend.limit_raised`, and the watcher
  sends it again until the day ends.
- When the gateway did not answer at the start, the server starts with the limits unsent, and the
  watcher trips on its first poll and sends the limits when the gateway answers.

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
`spend` ends at once with no record, so it does no work and the next claim waits for the clear. A
task step that fails while the stop stands counts no step error, and its next claim after the resume
runs it again. A worker call makes the same two reads for the task whose step started it, because
the gateway counts no turns, and while the stop stands the call fails with no sandbox started. A
turn that is running when the stop trips finishes.

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
cause, with the way the stop clears. A pause and a stop of a task work as usual. When you pause
nixie while the stop stands, the cause becomes `owner`, and the clear leaves nixie paused.

`spend.read` gives the notice. `spend.raise` takes the period's start and the totals for dollars,
tokens and turns, and works for a day trip only. It calls the gateway's `POST /raise`, then writes
`spend.limit_raised` with the session as `by`. A total above a cap, the gateway's for dollars and
tokens or the config's for turns, comes back as `above_cap` with the three caps, and writes nothing.
The host command `nixie spend raise --turns <n>` raises the day's turns past the turn cap, and
writes the host as `by`. The month's limit moves only in the config.

The web client shows the notice under the pause banner. A day trip offers "Raise today's limit" with
today's limit plus half, up to the cap, and the amounts stay editable until the one confirm. A month
trip, `unreachable` and `lost` show no button, and the pause banner offers no resume for the cause
`spending`.
