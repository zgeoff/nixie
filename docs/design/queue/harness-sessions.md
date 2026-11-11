# Turn outcomes and harness sessions

This doc covers 2 things that the `ended` frame of a guest carries. The first is the turn outcome:
how the turn ended, in words that are the same for every harness. The second is the session point,
which only a harness with a session sends. The doc also covers what a step sends and stores for a
harness with no session. The code that runs a task's steps reads these 2 values and never a value
that only one harness has.

The shapes and the exact error texts are in the sketch files under `sketches/harnesses/`, and this
doc holds the rules. Terms that this doc does not define are in
[model harnesses](model-harnesses.md#terms) and the [glossary](../../glossary.md). An item marked
`(open: <name>)` is not settled: see [the open list](open/harnesses.md).

## Terms

- **Turn outcome.** How a turn ended: `finished`, `stopped`, `limit`, `interrupted` or `overflow`.
- **Session point.** The place in a harness's own session where the next step resumes. The frame key
  is `ended.boundary`, and a step stores it as `sessionBoundary`. The Agent SDK's point is a session
  UUID and a message UUID.
- **Session.** The context that one turn runs on. Every turn runs on a session.
- **A harness with a session.** A harness that can resume a session in the next step. It declares
  both `resume` and `resume-at-entry` in `harnessCapabilities`. Its
  [harness record](model-harnesses.md#the-harness-record) holds a non-null `session`. Codex is a
  harness with no session.
- **Opening.** The `model.session_opened` record that a step writes when it starts a session.
- **Summary.** The text that a compaction stores in place of a session's history.
- **Session position.** What a step finds when it starts. It is one state of `SessionState`:

| State            | Meaning                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `fresh`          | The task has no stored point, no summary and no opening            |
| `unkept`         | The task has an opening, no summary, and no point its harness owns |
| `summarized`     | The task has a summary and no stored point                         |
| `lost`           | The task has a stored point and no opening                         |
| `invalidated`    | You forgot a memory item, or the persona changed                   |
| `resumable`      | The task has a stored point that its harness owns                  |
| `compaction-due` | As `resumable`, with a context size past the compaction threshold  |

## Built

This section states what the code does. Each section after it states the design.

- `ended.boundary` is required, and the session point union holds one member, the Agent SDK's. A
  point with no `harness` key parses as an `agent-sdk` point.
- `buildStepResult` stores `ended.boundary` as `sessionBoundary`.
- `ended` carries `subtype`, `stopReason` and `terminalReason` in the Agent SDK's words. The
  `messageID` of an `assistant` frame is a UUID.
- `isContextOverflow` reads `terminalReason` and holds the 2 overflow reasons, `blocking_limit` and
  `prompt_too_long`.
- `hasFinishedTurn` reads `stopReason === 'end_turn'` on a `model.turn_ended` record.
- `pickSessionPosition` returns every state of the table in Terms but `unkept`. A task with no
  stored point and no summary is `fresh`, with an opening or without one.
- The codec of `model.session_opened` allows `kind: 'rebuild'` with a null `reason`. A record
  codec's `decode` drops a key that it does not know, and fails on an enum value that it does not
  know.
- When a step's result asks for a wait and the task has an unread message, nixie sets the task to
  `ready` as it commits the result.
- A live inbox reader passes each message that arrives mid-turn to the guest as a `message` frame.

## The turn outcome

The `ended` frame holds a required `outcome`, and the host reads that field alone to tell how a turn
ended. Shape: [the turn outcome and the `ended` frame](sketches/harnesses/02-types.ts), section B.

- `finished` is a turn that the model ended. `limit` is a turn that the guest stopped at
  `limits.modelCalls`. `interrupted` is a turn that an `interrupt` frame stopped. `overflow` is a
  turn whose context passed the model's window.
- `stopped` is any other end, such as a refusal by the model or an output cap. Such a turn is never
  `limit`. (open: outcome values)
- `isContextOverflow` reads `outcome === 'overflow'`. `hasFinishedTurn` reads
  `outcome === 'finished'` on the record that the step just built, and on no other record.
- The `ended` frame holds `stopReason` and `terminalReason` as text in the harness's own words.
  nixie writes both to `model.turn_ended` and never reads them.
- The `ended` frame has no `subtype` key.
- The `messageID` of an `assistant` frame is a non-empty string.
- `model.turn_ended` holds `outcome`. The codec treats the key as optional, because a release
  without the key wrote records without it. nixie reads `outcome` only on a record that the running
  step built, so it never reads a record without the key.
- The design adds no record kind, and no value to an enum of a stored record.
- The design has no table of what a release does with data that another release wrote: a record with
  `outcome`, a stored session point, or a config with a profile on `harness: codex`. (open: release
  pairs table)

Each guest fills `outcome` by the first row of its own rows that matches. Flow:
[how each guest fills `outcome`](sketches/harnesses/03-flow.ts), section C.

| Guest     | Condition                                                              | Outcome       |
| --------- | ---------------------------------------------------------------------- | ------------- |
| Agent SDK | The terminal reason is `blocking_limit` or `prompt_too_long`           | `overflow`    |
| Agent SDK | The result is `error_max_turns`                                        | `limit`       |
| Agent SDK | A success whose stop reason is `end_turn`                              | `finished`    |
| Agent SDK | An `interrupt` frame arrived                                           | `interrupted` |
| Agent SDK | Any other result                                                       | `stopped`     |
| Codex     | The Codex status is `completed`                                        | `finished`    |
| Codex     | The status is `interrupted`, and the guest reached `limits.modelCalls` | `limit`       |
| Codex     | The status is `interrupted`, in any other case                         | `interrupted` |

- The Agent SDK guest checks `end_turn` ahead of the interrupt. So a turn that the model finished is
  `finished`, even when an `interrupt` frame arrived.
- The Agent SDK guest holds the list of the 2 overflow reasons. The host holds no such list.
- The Codex guest counts model calls and interrupts its own turn at `limits.modelCalls`. That
  interrupt gives `limit`. An `interrupt` frame from the host gives `interrupted`. (open: limit stop
  outcome)
- The 3 Codex rows cover every `ended` frame of the Codex guest. A Codex turn with the status
  `failed` sends a `failed` frame, which holds no outcome.
- The Codex guest sends `stopReason: null`, and never the text `end_turn`.
- The Codex guest sends no `overflow` and no `stopped`. A Codex context overflow arrives as a
  `failed` frame, and the step fails. (open: codex untested paths)

## The session point

- A guest sends `ended.boundary` exactly when its harness has a session.
- The session point union holds one member per harness with a session. So it holds the Agent SDK's
  member alone.
- A point that the Agent SDK stored parses and resumes. A point with no `harness` key is an
  `agent-sdk` point.
- The harness record's `session.owns` returns whether a stored point belongs to the harness.
- When a stored point belongs to another harness, nixie reads it as no point, and the step rebuilds
  the session from the log. This happens when a task's model profile is on another harness than the
  one that stored the point.

## A step on a harness with no session

On a harness with no session, nixie runs each turn on a session that it rebuilds from the log, and
stores nothing that the next step would try to resume. Flow:
[the session position](sketches/harnesses/03-flow.ts), section A, and
[what a step sends and stores](sketches/harnesses/03-flow.ts), section B.

The first step of a task finds `fresh`. Each step after it finds `unkept`, also when another harness
stored a point for the task. The one exception is `invalidated`, after you forget a memory item or
the persona changes. nixie derives `unkept` at each step and stores it nowhere.

What the step sends:

- A `turn` frame with no `resume` key.
- No `message` frame, because the step starts no live inbox reader.
- No `summarize` frame, because the position is never `compaction-due`. That position exists only
  for a harness that declares `summarize` and `context-window`.
- An `interrupt` frame when nixie stops the running turn, and only when the harness declares
  `interrupt`.

What the step stores:

- `sessionBoundary: null`.
- An opening with `kind: 'rebuild'`, `reason: null` and `lostSessionID: null`, on a step from
  `unkept`. Shape: [the opening record](sketches/harnesses/02-types.ts), section H.
- The opening never holds `reason: 'lost'`, because the step lost no session.
- The design adds no `reason` value for this case. The release that a deployment rolls back to would
  fail to decode one.
- A step from `fresh` or `invalidated` writes the opening that the built code writes.

A message that arrives mid-turn waits for the next step. nixie never marks it read in the running
turn. The step's commit finds it unread and sets the task to `ready`, so the next step opens with
the message.

Nobody has checked whether a task on the Agent SDK can have an opening and no stored point. Such a
task would find `unkept`. (open: agent-sdk unkept)

The next table gives the position that follows each position, for every harness. The event `open`
starts a session, `resume` continues a stored one, and `compact` replaces it with a summary.

| Position                         | Event   | Condition                | Next         |
| -------------------------------- | ------- | ------------------------ | ------------ |
| `fresh`, `invalidated`, `unkept` | open    | The step stores a point  | `resumable`  |
| `fresh`, `invalidated`, `unkept` | open    | The step stores no point | `unkept`     |
| `summarized`, `lost`             | open    | Always                   | `resumable`  |
| `resumable`                      | resume  | Always                   | `resumable`  |
| `compaction-due`                 | compact | Always                   | `summarized` |
| `compaction-due`                 | resume  | Always                   | `resumable`  |

The row for `resumable` holds while the context size is under the compaction threshold. A harness
with no session is never at `summarized`, `lost`, `resumable` or `compaction-due`. When you forget a
memory item or the persona changes, any position moves to `invalidated`.

## When a turn breaks the contract or overflows

- When a guest sends a session point and its harness has no session, the step fails as a broken
  contract.
- When a guest sends a context size and its harness declares no `context-window`, the step fails as
  a broken contract.
- When a guest sends `ended` with no session point and its harness has a session, the step fails as
  a broken contract. (open: host error texts)
- When a turn that opened a session overflows, the step fails.
- When a resumed turn overflows on a harness that declares `summarize`, nixie compacts.
- When a resumed turn overflows on a harness that declares no `summarize`, the step stores a null
  `sessionBoundary`. The next step finds `unkept` and rebuilds the session. Neither of the 2
  harnesses is such a harness.

## Not in scope

- A Codex member, or a "none" member, in the session point union.
- Resume, live messages and compaction on Codex.
- A fallback from `outcome` to the Agent SDK's words.
