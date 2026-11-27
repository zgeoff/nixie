# The atc adapter

atc is a separate program that runs coding sessions, one daemon per machine. atc-gateway serves the
tools of several daemons as one MCP server, and nixie calls it over HTTP as the service client
`service:nixie`. The `coding-atc` package implements the coding module's adapter interface with
those tools, and it is the one package that calls the gateway. It speaks MCP with the workspace's
MCP client, so nixie writes none of atc's wire protocol.

Read this doc before you change the adapter, or the coding source's reads.
[Coding tasks](../core/coding-tasks.md) covers the runner, the tools and the records that sit above
the adapter.

## The calls

Each adapter call maps to gateway tools:

| Adapter call | Gateway tools                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `start`      | `atc_events_read` with `limit` 1 and no cursor, then `atc_session_spawn` with the idempotency key     |
| `join`       | `atc_session_get`, then `atc_events_read` with `limit` 1 and no cursor                                |
| `list`       | `atc_sessions_list`, kept to the sessions on a configured daemon and target                           |
| `read`       | `atc_session_get` for the state, question, last reply and prompt; `atc_transcript_read` for the tail  |
| `steer`      | `atc_session_get` for the state, then `atc_terminal_type`                                             |
| `message`    | `atc_message_send`, with the idempotency key                                                          |
| `stop`       | `atc_session_stop`                                                                                    |
| `events`     | `atc_events_read` with a cursor, `waitMs` 25,000 and `limit` 200; `atc_session_get` per bound session |

- `start` reads the trail's cursor just before it spawns, and the spawn's `fromCursor` is that
  cursor, so the coding source can catch up the events that the session wrote before its task bound
  it. A join takes the cursor after its session read.
- The spawn sends the brief as `prompt`, a git workspace from the start's repo, and the daemon and
  target from the brief. It sets `trustClonedWorkspace`, because a session in a folder that the
  agent does not trust waits on a trust prompt that nixie never answers, and the user approved the
  repo with the start. atc accepts the flag only for an agent and target that can trust a clone. Any
  other start gets `bad_args` and fails.
- `atc_session_stop` stops the session's process and keeps atc's record of it. On a target that
  suspends its hosts, it puts the host to sleep.
- `events` reads every session in reach, with no session filter, and keeps only the bound sessions.
  The gateway refuses a cursor in a read whose filter differs from the read that gave the cursor.
- `steer` is the only call that types into a session. It never calls `atc_terminal_choose`, so the
  adapter answers no menu. It reads the session's state first, and refuses a session in `waiting`
  with `menu_open`, because a typed Enter would pick the menu's highlighted option. atc refuses the
  line itself with `permission_pending` while a Claude Code permission prompt is open. A menu can
  still open between the state read and the keystrokes, so the Enter can still pick the highlighted
  option.

## Session states and events

The adapter maps atc's session state to the coding module's `SessionState`:

| atc                                            | Session state |
| ---------------------------------------------- | ------------- |
| `running`                                      | `running`     |
| `needs_you`                                    | `waiting`     |
| `done`                                         | `idle`        |
| `exited`, with `lifecycle.harness` `suspended` | `gone`        |
| `exited`, otherwise                            | `ended`       |
| the answer `no_such_session`                   | `gone`        |

atc may add a state value in a later release. On a value the table lacks, the adapter keeps the last
state it mapped and logs the value.

`events` builds each session event from the trail:

- `message-answered` gives `answered`, with the whole answer from the event's `text`. An answer that
  atc marks `complete: false`, or whose `textError` is set, keeps the preview and ends with a line
  that says atc cut it. `message-unanswered` gives `unanswered`, and `note` gives `note`, read the
  same way. Every other kind of event is dropped.
- Each `state` event comes from an `atc_session_get` of a bound session. `events` reads one after
  every trail event of that session, and again once a minute for each bound session that has not
  ended, and yields a `state` event only when the state changed. A read that fails for any reason
  but `no_such_session` yields nothing. A test build that sets `NIXIE_TEST_ATC_URL` reads each
  second, so a double of the gateway can move a session's state within a journey.
- An event's key is `<daemon>.<incarnation>|<daemon cursor>`, from the event's `origin`, so it stays
  the same whatever the gateway's merged cursor holds.

The trail carries no sender. The coding step matches each answer to nixie's own note by its message
reference.

`read` builds the tail from `atc_transcript_read`, which pages oldest first. The adapter pages from
the start with `limit` 200 until `more` is false, because the call has no tail option, groups the
rows into turns, each one a user row and every assistant row after it, and keeps the last turns. An
agent with no transcript reader answers `unsupported`.

## Replies and keys

An adapter call returns `ok`, `refused` with a `canClear` flag, or `unknown`. A refusal that may
clear, such as a daemon that is down, makes the action queue try again on its backoff and fail the
action when its tries run out. A refusal that cannot clear fails the action at once. `unknown` is
the queue's ambiguous outcome.

| atc answer                                                                                        | Reply                       |
| ------------------------------------------------------------------------------------------------- | --------------------------- |
| `outcome_unknown`; a lost connection or a timeout after the request left                          | `unknown`                   |
| `daemon_unavailable` on a call with a key; `no_such_session` to a resent spawn                    | `unknown`                   |
| `daemon_unavailable` with no key, `target_unavailable`, `host_unavailable`, `timeout`, `too_slow` | `refused`, `canClear` true  |
| `permission_pending` to a steer; `host_leased` to a stop; HTTP 401; a refused connection          | `refused`, `canClear` true  |
| `unsupported` to a note in the session's first minute                                             | `refused`, `canClear` true  |
| `idempotency_conflict`; `bad_args`; `target_forbidden`; `session_dead`; HTTP 403; any other code  | `refused`, `canClear` false |
| `menu_open`, the adapter's own refusal of a steer to a session in `waiting`                       | `refused`, `canClear` false |

- atc refuses a note with `unsupported` while the session's message bridge has not attached, in the
  session's first moments, and for an agent that takes no notes. A later `unsupported` is final.
- atc's MCP answer carries only an error's code and `problem`, so the adapter cannot tell a daemon
  whose identity changed under a key from a daemon that is down. On a keyed call it treats either as
  `unknown`, and the queue resends the call under the same key.
- A steer's lost connection after the request left is `unknown`, and its `none` reconciliation sends
  it to the user, because the line may have reached the terminal.
- A spawn and a note declare `idempotency_key` reconciliation, and the queue keeps their key for a
  shorter time than a daemon keeps a completed key. The gateway holds its own binding of the key for
  longer than the daemon, so while the queue still holds the key, a resend never runs the call
  twice. Once the queue's key expires, the queue sends the unknown outcome to the user.
- A refused attempt's key is spent at the gateway, so a resend of it gets `outcome_unknown` and runs
  nothing. The next attempt after a refusal therefore takes the next key, `<action ID>.<n>`. An
  attempt after an unknown outcome keeps its key, which the gateway resends to the daemon as a
  replay. A replay gets the first answer only when the daemon holds the key as completed. When the
  first send never reached the daemon, every resend gets `outcome_unknown`, and the unknown outcome
  reaches the user once the queue's key expires.

## Config, token and reach

The deployment config's `coding.atc` block holds the gateway's `https://` URL, the principal's name,
the targets nixie lists, joins and starts on, a default target and an optional default agent. The
composition root resolves `token`, always `deployment:atc_token`, from the secrets file and passes
the adapter a plain string. The token is a static service token of the gateway, which starts with
`atcs_` and never expires. A static token needs no token endpoint and no refresh, and the gateway's
token file rotates it with no outage.

- The adapter sends the token only as the bearer of each request, and never logs it.
- The gateway's token file gives `service:nixie` the scopes `read`, `message`, `spawn` and `kill`.
  `spawn` covers typing into a session as well as a spawn.
- Each daemon's own config grants `service:nixie` the targets it may use. atc owns that grant. The
  adapter names a configured target in every spawn and keeps only those in every list.
- A principal's grant reaches every session on its targets, so `coding.sessions` shows the user's
  own sessions there, and a join can bind one. atc lets nixie's principal stop every session in its
  reach, so nixie's own `coding.stop` rules decide which sessions it stops.

## The coding source

The coding source reads the adapter's `events` into the thread of each coding task. It is a
[trigger source](../core/triggers.md) of the `stream` kind: it holds a long read open against atc,
where a `schedule` source fires on a timer. The core's `deliverTriggerBatch` writes one
`trigger.task_input` record per event, in the batch's transaction, and stores the source's cursor in
the same transaction, so a batch's records and its cursor commit together.

- The source drops each event of a session that has no bound `coding_sessions` row, and stores
  nothing of it, because nixie's principal reaches sessions that nixie is not working with. Only
  sessions that nixie started show in the live view, and the web client skips a joined one.
- The source can read a session's events before the coding task's step records the binding. When it
  starts, and when a session's row appears, it catches up each bound session whose state is not
  `ended`: it reads the trail from the row's stored cursor until a read has no more events. The
  catch-up keeps the source's own cursor where it was, and each event keeps its dedupe key, so an
  event that both reads deliver lands once.
- At its first start the source reads without a cursor and keeps only the cursor it gets, so it
  never replays the trail. atc deletes old events, except each listed session's newest event, and a
  cursor still reads every event after the deleted ones.
- A page that lists a daemon as unavailable keeps that daemon's place in the cursor, and the source
  reads that daemon again on the next call. A page that lists a daemon as truncated lost that
  daemon's older events, and the source logs the loss with the daemon's name.
- An event is `wake: true` when it is `ended`, `answered` or `unanswered`, or when the session's
  wake set holds a `state` event's state or a `note`'s label. An answer always wakes the step, so
  the step can reply to the note's sender with the answer's hop. Every other event gets
  `wake: false`: its record wakes no step, and only the coding module's fold of it updates the
  session's row.
- The source drops an event of a task that is stopped, done, failed or closed, and of a session
  whose row has `unbound_at` set, and still moves its cursor.
- A trigger input's hop is the `hop` of the session's row. The tasks module owns the record's codec,
  because the step's wake reads the hop, and every other waking record that is not a task message
  has hop 0.
- After a failed read the source waits, doubling its wait up to a cap, and reports itself unhealthy
  after several failures in a row.

## Versions

atc-gateway and its daemons deploy apart from nixie, and either side can roll back alone. The
gateway reports its version in its MCP server info as `atc-gateway/<version>`, and refuses a daemon
on another major atc version itself. Every gateway from 7.12.0 on serves service tokens and every
tool the adapter calls.

| nixie release                  | atc-gateway          | atc daemons |
| ------------------------------ | -------------------- | ----------- |
| the first with the atc adapter | 7.12.0 or later in 7 | major 7     |

- The adapter reads the version from the server info of each MCP initialize. On a version the table
  lacks, it sends nothing past the initialize. The source reports unhealthy and tries again on its
  backoff, and each action attempt gets a refusal that may clear.
- A daemon on a version the gateway cannot serve answers `daemon_unavailable`, which the reply table
  maps.
- A release that predates the coding runner can read no `trigger.task_input` record, so a rollback
  to it fails each coding task that such a record wakes.
