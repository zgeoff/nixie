# The API

nixie's API serves the [client](./client.md) contract over HTTP: Elysia hands every path under
`/rpc` to oRPC, which validates each input and output against the contract. The API resolves each
call to a row of the identity record, writes the user's messages into task inboxes once each, and
follows the [event log](../core/event-log.md) for the live stream. The package `modules/api` builds
the app, and the server mounts it and listens.

## A call's way in

The API refuses a call without the custom client header before any procedure runs, and writes
nothing for it, because a cross-site form cannot send that header. A call then carries its device
session as a bearer token or as the session cookie. The bearer token wins when both arrive, so a
server render that forwards a browser's session acts with exactly that session. Every procedure
except enrolment resolves the session to a row of the identity record first, and answers
`UNAUTHORIZED` when it resolves to nobody.

## Device sessions

Each device session is one row of the identity record: its channel, an external ID that for a device
session is the session's own ID, a label from the device name, and when it was paired, last seen and
revoked. A host command sets a session's label, which replaces the device name it enrolled with, so
the user names each device as they think of it, such as phone or PC. The row holds only the SHA-256
hash of its token, because a random token cannot be guessed back from its hash, so a copy of the
database grants no session.

An enrolment code turns into a session once. nixie keeps only the code's hash, and a code lapses
unused after the enrolment code lifetime. The host's code comes from a function the server calls at
start: it issues a fresh code on each call while no device holds a live session, so the first device
can sign in, and issues nothing once one does. A host command issues a code at any time. A signed-in
device issues codes through a checked action.

A browser receives its token only in a host-only cookie that is `HttpOnly`, `Secure`, `SameSite=Lax`
and `Path=/`, so no script reads it. The path matters because enrolment sets the cookie from an
`/rpc` response, and a cookie with no path would reach only `/rpc`, so the web server would render
every page signed out. The cookie is `Lax`, not `Strict`, because a launch of the installed web app
from its icon is a navigation from outside the site, and the browser leaves a `Strict` cookie off
that first request. `Lax` still keeps the cookie off a cross-site `POST`, and every procedure is a
`POST` that also needs the client header. The Android app receives its token in the enrolment
output.

A session lapses after the idle limit passes with no call, and a call moves the session's last seen
time at most once per short interval, so a busy client does not write on every call. A revoke keeps
the token hash on the row, so a later call with the revoked token resolves to its row and is refused
under the session's ID. A revoke also ends the revoked device's live stream when the revocation
record reaches it.

The identity record, the enrolment codes and the checked-action results are plain tables, not
projections, because a call moves a session's last seen time without a record. Each change an audit
needs writes a record in the same transaction: a code issued, a session enrolled, a session's label
set, and a session revoked. The enrolment record encrypts the device name and the label record
encrypts the label, while the identity row keeps it in plain text, because the session list shows it
on every device and a session's label is no message.

Each checked action checks inside its own write transaction that the caller's session is still live,
so a revoke that commits after the call resolved its session still stops the action.

A [reset](../core/event-log.md#the-reset) keeps every live session, so each device stays signed in
with the token it holds. The reset deletes every revoked or lapsed identity and every enrolment
code, so a revoked token afterwards resolves to nobody and is refused as a stranger, and an unused
code stops working. Each kept session gets a `session_kept` record, which holds its ID, channel and
first paired time and encrypts its label, and the identity row points at that record in place of its
enrolment record, which the reset deleted. The session's enrol, label and revoke history goes with
the old log.

## Read-only tokens

A read-only token lets a check outside nixie read the conversation and the task list, and never
write. The deployment config lists the SHA-256 hash of each token under
`api.read_only_token_hashes`, so the deployment repo holds the hash, and the token itself stays with
the check. nixie never issues a read-only token, and no row of the identity record holds one.

The API checks the token before any procedure runs. A call with a read-only token reaches only
`conversation.read`, `tasks.list` and `tasks.read`, and the API answers any other path with a 403.
The token then resolves to one fixed read-only caller, without a write: no last seen time and no
refusal. The token never lapses. Removing its hash from the config and restarting nixie revokes it.

## Passkeys

The `passkeys` procedures register, list and revoke the passkeys that approve a high-risk proposal,
and issue the challenge that an assertion answers. [Passkeys](../policy/passkeys.md) describes the
check, the challenge and the registration rules. Each call reads the `Origin` header, because the RP
ID is the hostname of the origin the client runs on. The API keeps its challenges, its registration
options and the host's code in memory, so a restart drops them.

## Checked actions

Enrolment, code issue, revoke, message send, record forget, the changes of the
[memory view](../memory/view.md#changes), a moment's keep, edit, link and destroy, the undo of a
task definition change, and each task control share one table of client action IDs, which holds the
first result of each action and a hash of its input. A retry with the same ID and input gets the
first result, and the same ID with another procedure, input or caller gets
`CLIENT_ACTION_ID_REUSED`. These results hold secrets that nixie keeps only as hashes, or not at
all, so a retry gets a fresh value that replaces the first:

- The API answers an enrolment retry with the same session and a fresh token, and the first token
  stops working. It works only while the code it used would still work.
- The API answers a code issue retry with a fresh code that keeps the first code's lapse time, so
  one action never leaves 2 codes working. Once the first code is used or lapsed the action is over,
  and a retry gets `CLIENT_ACTION_ID_REUSED`.
- The API answers a `computer.watch` retry with a fresh watch address. The stored result records
  that an address was minted and holds none.

## Watching the computer

`computer.watch` takes a client action ID and answers `streamURL`, a path on the API's own origin
that the client resolves against the page's origin, so the browser's session cookie reaches it. The
path never takes its host from the caller's headers. It is a checked action for a signed-in session
of the `full` scope only. A wall-panel session and a read-only token get the refusal that every call
outside their allow lists gets, and a revoked or lapsed session gets `UNAUTHORIZED`. It answers
`COMPUTER_UNAVAILABLE` when the server runs no computer.

The URL is `/rpc/computer/watch-stream` with a ticket in its query. The ticket is 32 random bytes
that live in the API's memory for
[a short lifetime](../../../modules/api/src/computer/create-watch-tickets.ts) and open one socket.

- The upgrade redeems the ticket, which deletes it, and then checks that the session cookie of the
  upgrade request resolves to the session that minted it. Only the cookie counts, because a
  browser's socket sends it and never a bearer token. Any failure answers a bare 401 and keeps the
  reason out of the answer.
- The ticket is never stored, because a retry mints a fresh one, and never logged: a refusal logs
  the route without the query.
- The socket accepts binary messages only, up to a size cap, and closes on text with code 1003. It
  relays both ways through [the computer's watch](../connectors/computer.md#watching). The socket
  carries the keys and pointer of its session only while that session holds the desktop.
- The socket closes with code 1008 when its session is revoked or lapses, including while the
  sandbox is still waking. The API follows `session.revoked` records and re-probes the session on a
  timer of the shorter of the idle limit and the last-seen interval. A revoked session's hold stays
  until its idle hand-back, except when the revocation subscription failed: then the timer's check
  that finds the session revoked ends the hold too.
- The server serves the socket from its own `Bun.serve`, ahead of the Elysia app, so a request that
  asks for the route skips the app's handlers and takes the server's call gate like any other call.

`computer.takeOver` and `computer.handBack` are checked actions with the same session rules as
`computer.watch`, and a retry of the same action ID gets the stored answer, a refusal included. Two
tries of one action ID that overlap run one after the other, so both get the first's answer.
`takeOver` answers `takenOverAt`, or `BUSY_TOO_LONG` when the assistant's calls ran past their
limits, or `HELD_ELSEWHERE` when another device holds the desktop. `handBack` answers
`durationSeconds`, or `NOT_TAKEN_OVER` when the calling session does not hold it. Both answer
`COMPUTER_UNAVAILABLE` when the server runs no computer.
[The computer](../connectors/computer.md#taking-over) describes the hold.

`computer.readHandover` reads the assistant's
[standing ask](../connectors/computer.md#asking-for-a-take-over) for a take-over. It answers the
ask, with its sequence and its reason, or `null`, and the log sequence it read at, so a client
follows the live stream from there. The ask is the newest of the records `computer.handover_asked`,
`computer.handover_closed` and `computer.takeover_started` on the conversation's thread, when that
record is an ask. A caller of a scope below full, and a server with no computer, get `null`. A
`computer.handover_asked` record on the stream carries its reason while the reason is readable.

## Refusals

A call whose token resolves to nobody gets a refusal record, which holds the channel, the external
ID and the time and none of the call's content, because a stranger's input is untrusted content
nobody asked nixie to keep. A revoked or lapsed session is refused under its session ID.

Every token nixie never issued shares one external ID, so a stranger who sends fresh random tokens
still gets one refusal per interval, and the record never holds the token. A refusals projection
keeps the last refusal time for each external ID from the record's payload, and nixie writes at most
one refusal per external ID per refusal interval, so a stranger who keeps calling cannot fill the
log. nixie reads that time before it opens a write transaction, so a refused call inside the
interval writes nothing.

A call with no token at all is only signed out and writes nothing, because every signed-out page
load and the web server's readiness check make such calls.

## Controlling a task

The 6 task controls are checked actions that name a task: pause, resume, stop, restart, close and
interrupt, as [pause, stop and close](../core/tasks.md#pause-stop-and-close) describes. Each answers
with the task's state, whether a pause waits on the running step, and when the control took effect.
A control that the task's state does not allow gets `TASK_STATE_REFUSED` with the state it met, a
close of the conversation gets `CONVERSATION_NEVER_CLOSES`, a close of a definition's task gets
`DEFINITION_TASK_NEVER_CLOSES`, a control that the task's runner does not offer gets
`RUNNER_LACKS_CONTROL`, and a task that does not exist gets `TASK_NOT_FOUND`. A refusal keeps no
result under its action ID, so a retry of the same action runs the control again against the state
the task holds then.

A seventh checked action, `tasks.setDisposable`, takes a task ID and a `disposable` value and writes
a `task.mark_set` record. It gets `TASK_NOT_FOUND` for an unknown task, `TASK_HAS_NO_MARK` for a
task that carries no mark, such as the conversation, and `TASK_STATE_REFUSED` with the state for a
closed or done task. A change never closes a task: the close control does. The listed task holds
`disposable`, which is `null` for a task with no mark, and `closedBy` for a closed task.

An action read lists a task's queued actions, which a stop cancels, apart from its started ones,
which run on to their outcome, so a client shows what a stop does before the user confirms it. While
nixie is paused, the resume control exempts the task from the pause, so the task runs while the rest
stay paused.

## Pausing nixie

`nixie/pause` and `nixie/resume` are checked actions that take only a client action ID. Pause writes
the pause with the cause `owner` and the session's identity as the actor, and resume ends it. Each
answers with the pause state that the same transaction reads after the write: the cause, which is
`restore`, `owner` or `spending`, and since when, or null when nothing pauses nixie. A resume while
nothing pauses nixie answers null and writes nothing. Replay and reuse of a client action ID work as
they do for a task control.

`nixie/read` answers the same pause state to any signed-in caller. The pause records sit on no
thread, so the record stream never carries them, and a client polls this read instead.

`recovery/read` answers the last restore: when it ran, when its backup was taken, and each task it
left to check, with the task's name, its state at the backup, whether a step was running, and how
many actions had no outcome. The name comes from the task directory, and falls back to the task ID
for a task the directory lacks. The read stays available after the resume, and answers null before
any restore.

Each listed task carries `isPausedByNixie`, true while nixie's pause stops that task and no resume
of its own has exempted it. The task's `state` stays the state the task holds, so a client that
predates the field reads the same states.

## Sending a message

The API writes the user's message as an `owner_message` record in the inbox of the task its thread
names, in the transaction that keeps its client message ID, so a retry can never write it twice. The
text, its spans and the label of the session it came from sit in the record's erasable fields under
one key, so forgetting the message forgets how it arrived too.

The message keeps the label its session had when it was sent, so a new label reaches the next
message and leaves the earlier ones as they were. The payload holds the client message ID, the
identity row it came through, whether the spans are the client's own, the sending device's time zone
when the client sent one the server knows, and the time the device says the user wrote the message,
which [time](../connectors/time.md) covers. A send to a thread whose task does not exist or has
ended gets `THREAD_NOT_FOUND`.

The API keeps the spans only when they run from the start of the text to its end in order, each
non-empty, with no gap and no overlap, counted in UTF-16 code units. Otherwise the whole message
becomes one unknown span, so a client that cannot tell fails closed.

nixie keeps no hash of a message's text, because a hash would outlive a forget of the text and
confirm a guess at it. A retry is therefore compared with the first record itself: a different
thread or text is refused, and once the first record's text is forgotten, only its thread is
compared.

## Forgetting a record

A forget removes one record with its own text for good, so the text is gone from every copy nixie
keeps. That covers a message, a reply, a tool call or result, an action, a proposal answer and every
other kind that carries [erasable fields](../core/erasable-fields.md#declaring-erasable-kinds),
except these:

- A moment's own records, which the moment's removal takes.
- A memory item's own records, which the item's forget takes.
- A note's own records, which the note's forget takes.
- A record whose kind carries no erasable fields.

A forget takes only the record it names, and the whole of it, because each record has one key and no
field has a key of its own. A reply that quotes the forgotten text stays readable until it is
forgotten too.

The API reads the kinds from `forgettableKinds` in the contract library, and a test holds each
erasable kind to exactly one of the moment, memory item and note groups and the list. The forget is
a checked action bound to the record's thread and sequence. The API answers `RECORD_NOT_FOUND` for a
sequence that names a record outside the list, a record on another thread, and a record with no
thread, such as a session label. It answers `ACTION_NOT_FINISHED` for the record that queued an
action that has neither run nor been cancelled, because the action reads its arguments from that
record. The refusal writes nothing, so the same client action ID succeeds once the action has run or
a stop cancelled it. It runs as a durable operation in 2 parts, as a
[memory forget](../memory/store.md#forgetting) does:

1. In the transaction that keeps the action's result, the API commits a `record.forget_started`
   record on the record's thread, which names the record by its sequence, and a
   `memory.evidence_purge_started` record that lists the memory items to purge, when any item quotes
   the record. A second forget of the same record answers with the first forget's time and commits
   no second start.
2. The cleanup deletes the record's key and checkpoints the key store, runs the conversation's
   [session cleanup](../memory/context.md#forgetting-and-the-live-session), which also purges the
   [evidence](../memory/store.md#the-evidence-purge) of each listed item, and commits
   `record.forgotten`.

The key goes before the session cleanup, so the session the next turn rebuilds reads the record as a
gap. Every step of the cleanup is safe to run twice. The API listens before the conversation starts,
so a forget that arrives first stops after the key deletion, as does one that a crash cuts short.
The server's start hands the API the session cleanup and then finishes every such forget, before any
runner claims work, so no turn resumes a session that holds the text. A retry of the action runs the
cleanup again too, so a cleanup that failed finishes on the retry.

The answer carries `forgottenAt` and `backup`, the key backup state that a
[memory forget](../memory/store.md#forgetting) reports. The API reads it fresh on every answer, a
replay of the client action included:

- `deleting`, while no `record.forgotten` names the record. The state reads pending, or off when
  nixie stages no backup.
- `forgotten` with no sequence, when neither the record nor a brief's start call held a key. No
  backup set can hold a key that never existed, so the state reads complete.
- `forgotten` at the sequence of `record.forgotten`, otherwise. The backup job's report for that
  sequence gives the state.

### The log.forget tool

The conversation's model removes a record of its own thread with the `log.forget` tool, which takes
`record`: the event ID of the record, as the stamp of a message, a `log.read` entry's `eventID` or
`callEventID` shows it. The tool joins the conversation's tool list and no task's. It declares the
[`delete` effect](../policy/decision-point.md#effects-and-declarations), so it runs as a queued
action, and the user's rules decide each call:

- Under the starter rules, `ask-permanent-deletes` asks. The card shows the record's kind and text,
  and how many moments and memory items go with it. Nixie reads the text when it reads the card and
  keeps no copy in the proposal, the call, the result or the notice. A card whose record or preview
  cannot be read has no body, so the user never approves a removal without its preview.
- Rules decide strictest first, so an allow rule for the tool removes a record with no approval only
  once the user's ask rule no longer catches the call. The user narrows or removes
  `ask-permanent-deletes` and adds the allow rule.

Before any ask is written, the tool refuses a record of another kind, a record that does not exist
on the thread, and a queued action that has not run. It runs the same forget as the API, so a repeat
of a finished forget changes nothing.

An allow rule makes the forget run during the turn that called the tool. The forget's session
cleanup aborts the turn, and the turn's step runs again after its retry delay on a rebuilt session
where the record is a gap. The call waits at most `queuedWaitMs` for the action, so the turn never
hangs.

The action's `action.outcome` record holds the removed record's event ID and kind, never its text.
The API reads them into the `removal` field of the contract record, with the sequence of the call
that asked for the removal, and the web client shows one muted line under the last reply of the turn
that made the call, even when the owner approved the call after later turns.

## Undoing a task definition change

`definitions.undo` takes a client action ID and the ID or short ID of a change that a
`definition.changed` record names. It undoes that change as
[`undoDefinitionChange`](../core/definitions.md#changes-from-the-conversation) decides, and returns
the definition ID and the ID of the undo. The API runs one undo at a time, because a change takes
effect through its seed and the next undo reads what the seed left. It answers `NOT_STARTED` (503)
while the server holds no definitions context, and each refusal of the undo is a typed error:

| Code                 | Status | Data                                   |
| -------------------- | ------ | -------------------------------------- |
| `NOT_FOUND`          | 404    | none                                   |
| `REPLACED`           | 409    | `head`: change ID, short ID, operation |
| `REPO_MOVED`         | 409    | `seedSequence`                         |
| `NOT_IN_FORCE`       | 409    | `cause`                                |
| `ONE_SHOT_OVER_REPO` | 409    | none                                   |
| `ONE_SHOT_PAST`      | 409    | none                                   |

A `definition.changed` record reaches the client with a `definitionNotice` field: the definition ID,
its name, the operation, the change's IDs, whether the change leaves a version, the trigger in
words, the next fire, the state of the change and whether its version is unreadable. A client tells
an undo that removes the definition from an undo that restores a version with no trigger by
`hasVersion`, because both carry no trigger words.
[Changes from the conversation](../core/definitions.md#changes-from-the-conversation) says when
`next` is null. The record kinds in the stream do not change, and a client that does not know the
field ignores it.

## Reading tasks

A task list read returns the most recently active tasks up to a cap, each with its name, brief,
state, last activity, whether it takes a message of the user's, the task it waits on, the controls
its runner offers and its [action counts](../core/actions.md#cancelled-actions). It also gives the
log sequence it read at, which it reads before the tasks, so a client that follows the log from that
sequence sees every change the list leaves out. Each listed task also names its `runner`. A client
shows only the controls that the task's [runner](../core/started-tasks.md#task-runners) offers and
the task's state allows. A started task whose name the user forgot shows under its ID. A task read
returns one task with the same fields, whatever its place in the list, so a task's page shows a task
past the cap.

Each listed task also gives `listedState`, the state that the model tool `tasks.list` reads: the
stored state, or `idle`, `finished` or `asleep` for a task whose stored state is `waiting` with no
open wait. While nixie's pause holds a task whose stored state is `ready`, `running`, `waiting` or
`paused`, it lists as `paused`, and its stored state does not change. An exempt task, and a task
that has stopped, failed, finished or closed, keeps its own listed state. The model tool does not
apply the pause. A task of a definition also gives its `definitionID` and a `fire`: the scheduled
time, the fire time and whether it was a catch-up, taken from the open task run, or from the newest
one when none is open. The `fire` is null when that task run has no fire, which holds for a poll
fire, a message and a fire that a reset of the log removed. A carrying task run gives the fire of
the task run that it carries on from. A started task has no `fire` field.

`tasks.list` takes an optional input with a `definitionID` and a `states` array of 1 to 11 distinct
listed states. The server applies both before the cap of 100 tasks, so a filter finds a task that
the unfiltered list leaves out. A call with no input or an empty one lists as before. Every new
field is optional: a server of the release before strips the input and gives none of the fields, and
a client then groups by `state` and shows the list unfiltered. A client of the release before
ignores the fields.

## Reading ended task runs, the trigger report and the definitions

An ended task run is a task run that has ended with any cause. `tasks.listEnded` returns the ended
task runs newest first, one page per call, each with its cause, who ended it, how it reported and
what it used, its `fire`, and the sequence of its `task.run_ended` record. The `fire` is the one
that opened the task run's work, as a task list read gives it. It also returns one listed task for
each task of the page, with the same fields as a task read. A task of a definition that left force,
with no task run open, shows under the name of the version that its newest ended task run pinned,
and a task whose version is no longer stored has no entry, so a client shows its task runs by task
ID. A page holds at most 100 task runs. Its `next` is the sequence of the last task run that the
page holds, and the client sends it as `before` to read the page after. The last page has a `next`
of null, so a client never reads an empty page.

`triggers.report` returns the fires that came late and the fires that nixie skipped, newest first,
from the start of a date in the user's zone. A late entry is a `trigger.fired` record that is a
catch-up, with how many seconds late it fired. A skipped entry is a `trigger.skipped` record, with
its reason, and its `scheduledFor` is the newest slot the record covers. An entry names its
definition by the version that fired, then by the definition in force, then by the newest stored
version, and last by the definition ID.

`definitions.listTasks` returns each definition of the seed in force, with its trigger in words, the
date of its next fire and the task bound to it. The next fire is null for a spent one-shot and for a
definition with no armed trigger, such as a disabled one. `createdBy` names the record that put the
version in force. For a definition from the repo, it is the oldest seed of the newest unbroken run
of seeds that hold the same version. For a runtime definition, whose `origin` is `nixie`, it is the
`definition.changed` record of the change in force.

## Large payloads

A record carries 4 payload fields: `toolCall.input`, `toolCall.content`, `worker.text` and
`worker.detail`. A conversation read and the live stream cut the long strings of these fields only
when the client sets `clipPayloads`. A client that sets nothing, such as one from before clipping,
gets every field whole.

- The server cuts each string whose UTF-8 size passes `payloadClipBytes` (4,096) to its first
  `payloadClipBytes` bytes, on a code point boundary. It lists each cut string in the record's
  `clipped`, with its field, its path inside the field and its whole size.
- When a field's JSON still passes its size limit after those cuts, the server leaves the field out
  and lists it with an empty path. A field of many short strings can reach that size.
- Every field outside the 4 payload fields arrives whole, such as a message's text. The step end
  that a page read returns beside its records is never cut, because the failure notice reads its
  error from it.

`records.readPayload` takes a thread and a sequence and returns the whole payload fields of that
record, read through the same mapping as the page, with no cut. Its status is `readable`,
`forgotten` when a forget or a log reset destroyed the record's key, or `unreadable` when the key
fails to decrypt the fields. A sequence that belongs to another thread returns `RECORD_NOT_FOUND`,
so a caller reads a record only through the thread that holds it. The procedure returns only what a
page read already holds for a caller who asks for no clipping.

The 3 worker record kinds map to `worker`: `started` with the worker run's short ID, model, tools
and limits, `turn` with the sum of its 4 token counts, its dollars and its text, and `ended` with
its outcome, limit, usage and failure detail. A tool call and its result carry `toolCall.runID`, the
run that made the call. A worker's own tool calls carry the worker run's ID.

## The notebook

The web client reads the [notebook](../memory/notebook.md) with `notebook.listNotes`,
`notebook.readNote` and `notebook.readCheck`. Each takes `showPrivate`, which defaults to off. With
it off, the calls leave out every private note and every link to or from one, and `readNote` of a
private note answers its ID alone. `readNote` never returns a private note's body. A call that runs
before the notebook starts answers `NOTEBOOK_NOT_STARTED`, and an unknown or forgotten note answers
`UNKNOWN_NOTE`.

`notebook.openPrivate` is a checked action that returns a private note's body and the version before
it, and appends one `notebook.private_opened`. A retry answers with the same body and appends
nothing. It answers `NOT_PRIVATE`, and writes nothing, for a note that is not private.

### Forgetting a note

`notebook.previewForget` reads a note's version, title, version count and link counts without
opening a private note. `notebook.forget` is a checked action that binds to that version and answers
`STALE_VERSION` when the note moved on. It runs the
[2-part forget](../memory/notebook.md#forgetting-a-note) and answers `forgottenAt` and `backup`, the
backup state that a [memory forget](../memory/store.md#forgetting) reports, read fresh on every
answer. A retry of the action finishes a cleanup that a failed call left.

The `conversation.previewForget` answer also lists the active notes that link to the record, with a
private note's title left out, so the confirmation can show that those notes keep their text.

## Reading and forgetting images

The `images` calls serve the stored [images](../connectors/images.md#storage) to a device session. A
read-only token reaches none of them and gets a 403.

- `images.list` takes `pinnedOnly` and a cursor, and returns up to 30 images newest first by the
  `images` table's rowid, with `nextCursor`. A call reads at most 300 rows and leaves out each
  forgotten image, so a page can hold fewer than 30 images, or none, while `nextCursor` remains. The
  cursor is the rowid of the oldest row the call read.
- `images.read` returns one image by its short ID: its name, prompt, `from`, source, pin, creation
  time and `isForgotten`. A forgotten image returns no name and no prompt, and keeps its `from`, so
  a client can walk back through the edits past it. An ID that names no image returns
  `UNKNOWN_IMAGE`.
- `images.readBytes` returns the stored PNG for `full`, and a WebP of at most 512 pixels on its long
  edge for `thumbnail`. The server makes each thumbnail on the read and stores none, so a forget
  leaves no copy of the picture. A forgotten image returns `IMAGE_FORGOTTEN`.
- `images.forget` takes a client action ID and an image ID. It forgets the image's `tool_called`
  record and `tool_result` record, every `image.named` record that names it, the call and result of
  each `image.name` that named it, and each `image.list`, `image.read` and `image.name` result that
  quotes its name or prompt, on whichever thread each one sits. One transaction finds those records,
  starts every record's [forget](#forgetting-a-record) and keeps the list with the client action,
  then each cleanup runs. After the cleanups, it reads the image's records again and forgets any it
  missed, until a read finds none. An `image.name` call matches by the image's short ID or its UUID.
  The answer's backup state is `failed` when any record's state is failed, else `unknown` when any
  is unknown, else `pending` when any is pending, else the state they share. A retry with the same
  client action ID runs the cleanups of the kept list and of any record found since, which finishes
  what a failed call left. An imported image's forget leaves the photo or file it came from, which
  keeps its own record. A forget of an image that is already forgotten forgets the records that
  still have a key, and answers with the time of the first forget when none does. From the moment a
  forget starts, `image.name` refuses the image as forgotten, so no name is written between the
  start and the cleanup.

## Reading a code-run file

`files.read` takes a file ID and returns that file's bytes with its name, to any signed-in session,
whichever thread the code run wrote the file on. An ID that no code-run file has resolves as an
image's short ID, and returns the stored PNG named `{id}.png`. It returns the stored type for PNG,
JPEG, GIF and WebP, and `application/octet-stream` for every other type, so a client never receives
a type that a browser would run. An unknown ID returns `FILE_NOT_FOUND`, and a file whose result
record a forget made unreadable returns `FILE_FORGOTTEN`.
[The code tool](../connectors/code-tool.md#sending-a-file) covers how a file reaches the user.

`files.list` takes an optional `kind`, `image` or `other`, and an optional cursor, and returns up to
30 files, newest run first, with `nextCursor`. `image` lists the 4 types that `files.read` serves
with their stored type, and `other` lists every other type. Each file holds its ID, name, size,
type, the time of its result record, its thread, the task's ID and name (null for the conversation),
the position of its result record, whether `file.send` sent it, and how many files its code run
wrote. A call reads at most 300 stored rows, so a page can hold fewer than 30 files while
`nextCursor` remains. The list leaves out the kept streams, every file whose result record a forget
made unreadable, and every stored image, although `files.read` serves an image by its ID.

## Reading and the live stream

A conversation read returns the newest page of a thread before a sequence, and the log sequence it
read at. The page holds no record past that sequence, so a client that follows the log from it
misses no record and repeats none. A page that holds a tool result also holds the call it answers,
even past the page's size, because the client reads what a call did, such as the receiver and text
of a task message, from the call and its result together.

The live stream follows the event log by sequence through a log subscription, and each event's ID is
its record's sequence. A client that reconnects sends the last event ID it received, and the stream
resumes after that record, whatever start the input holds. The stream shows only records that belong
to a thread, because session and refusal records belong to none and no client view shows them. A
message record carries its text and spans while its key exists, and keeps its place with no text
once the message is forgotten. Each forget record carries the sequence it forgets, so a client drops
that message's text as the record arrives. A task message carries its sender's name, kind, hop and
body, an exchange notice carries its text with a link to the receiver's thread, and a stop carries
the actions it cancelled. A record whose key a forget deleted carries `isRemoved`, which the server
reads from the `record.forget_started` record that names it, so a record whose key fails to decrypt
carries no mark. A page and the stream read these records the same way.

A `model.reply_voided` record names a reply it voids, with the reason, in `voidedReply`. A page read
sets `isVoided` and `voidReason` on the `message` of each reply on the page that a void record
names, reading the record through an index on the reply's sequence. A reply that the stream sends
before its void record exists carries neither field, and the client sets them when the void record
arrives. All three fields are optional. A reply record reaches a page and the stream when the host
writes it, before the step's commit record, so a client sees each reply of a running turn.

A step commit carries the step's read cursor: the sequence of the newest record in the task's
[inbox](../core/tasks.md#the-inbox) that the step read. The step read a message when its cursor is
at or after the message's sequence. A client checks the cursor, because a step that started before
the message can end after the message.

The API checks the caller's session before it opens the live stream and refuses a missing or revoked
session with a plain 401, so a stream that opens is one the API accepted. A session revoked while
its stream is open ends that stream with the same error.

The live stream answers at a path with no `log` segment, because EasyPrivacy, a filter list that
content blockers enable by default, blocks `/rpc/log/` on every domain. The stream's first path
stays in the contract as a deprecated alias for the clients of earlier releases, which a later
release may remove.
