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
[memory view](../memory/view.md#changes), a moment's keep, edit, link and destroy, and each task
control share one table of client action IDs, which holds the first result of each action and a hash
of its input. A retry with the same ID and input gets the first result, and the same ID with another
procedure, input or caller gets `CLIENT_ACTION_ID_REUSED`. Two results hold secrets that nixie keeps
only as hashes, so their retries answer with fresh values that replace the first:

- The API answers an enrolment retry with the same session and a fresh token, and the first token
  stops working. It works only while the code it used would still work.
- The API answers a code issue retry with a fresh code that keeps the first code's lapse time, so
  one action never leaves 2 codes working. Once the first code is used or lapsed the action is over,
  and a retry gets `CLIENT_ACTION_ID_REUSED`.

## Refusals

A call whose token resolves to nobody gets a refusal record, which holds the channel, the external
ID and the time and none of the call's content, because a stranger's input is untrusted content
nobody asked nixie to keep. A revoked or lapsed session is refused under its session ID. Every token
nixie never issued shares one external ID, so a stranger who sends fresh random tokens still gets
one refusal per interval, and the record never holds the token. A refusals projection keeps the last
refusal time for each external ID from the record's payload, and nixie writes at most one refusal
per external ID per refusal interval, so a stranger who keeps calling cannot fill the log. nixie
reads that time before it opens a write transaction, so a refused call inside the interval writes
nothing. A call with no token at all is only signed out and writes nothing, because every signed-out
page load and the web server's readiness check make such calls.

## Controlling a task

The 6 task controls are checked actions that name a task: pause, resume, stop, restart, close and
interrupt, as [pause, stop and close](../core/tasks.md#pause-stop-and-close) describes. Each answers
with the task's state, whether a pause waits on the running step, and when the control took effect.
A control that the task's state does not allow gets `TASK_STATE_REFUSED` with the state it met, a
close of the conversation gets `CONVERSATION_NEVER_CLOSES`, and a task that does not exist gets
`TASK_NOT_FOUND`. A refusal keeps no result under its action ID, so a retry of the same action runs
the control again against the state the task holds then. An action read lists a task's queued
actions, which a stop cancels, apart from its started ones, which run on to their outcome, so a
client shows what a stop does before the user confirms it. While nixie is paused, the resume control
exempts the task from the pause, so the task runs while the rest stay paused.

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
one key, so forgetting the message forgets how it arrived too. The message keeps the label its
session had when it was sent, so a new label reaches the next message and leaves the earlier ones as
they were. The payload holds the client message ID, the identity row it came through, whether the
spans are the client's own, the sending device's time zone when the client sent one the server
knows, and the time the device says the user wrote the message, which [time](../connectors/time.md)
covers. A send to a thread whose task does not exist or has ended gets `THREAD_NOT_FOUND`.

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
except 3 groups:

- A moment's own records, which the moment's removal takes.
- A memory item's own records, which the item's forget takes.
- A record whose kind carries no erasable fields.

The API reads the kinds from `forgettableKinds` in the contract library, and a test holds each
erasable kind to exactly one of the 3 groups and the list. The forget is a checked action bound to
the record's thread and sequence. The API answers `RECORD_NOT_FOUND` for a sequence that names a
record outside the list, a record on another thread, and a record with no thread, such as a session
label. It answers `ACTION_NOT_FINISHED` for the record that queued an action that has neither run
nor been cancelled, because the action reads its arguments from that record. The refusal writes
nothing, so the same client action ID succeeds once the action has run or a stop cancelled it. It
runs as a durable operation in 2 parts, as a [memory forget](../memory/store.md#forgetting) does:

1. In the transaction that keeps the action's result, the API commits a `record.forget_started`
   record on the record's thread, which names the record by its sequence. A second forget of the
   same record answers with the first forget's time and commits no second start.
2. The cleanup deletes the record's key and checkpoints the key store, runs the conversation's
   [session cleanup](../memory/context.md#forgetting-and-the-live-session), and commits
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

## Reading tasks

A task list read returns the most recently active tasks up to a cap, each with its name, brief,
state, last activity, whether it takes a message of the user's, the task it waits on, the controls
its runner offers and its [action counts](../core/actions.md#cancelled-actions). It also gives the
log sequence it read at, which it reads before the tasks, so a client that follows the log from that
sequence sees every change the list leaves out. Every task runs on the nixie runner, which offers
all 6 controls, and a client shows only the controls that the runner offers and the task's state
allows. A started task whose name the user forgot shows under its ID. A task read returns one task
with the same fields, whatever its place in the list, so a task's page shows a task past the cap.

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
