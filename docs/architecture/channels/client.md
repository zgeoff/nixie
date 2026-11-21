# The client

The user reaches nixie through a client that calls one typed API, an oRPC contract in
`libs/contract`. The contract holds schemas, types and pure functions and no server code, so every
client depends on it and the server validates every input and output against it. The web client in
`apps/web` is a TanStack Start server with its own process and image beside the API, and it renders
the conversation from the log as it grows. [The API](./api.md) covers the server that serves the
contract, the [client design](../../design/platform/channels/client.md) covers the Android app, and
the web client's tests run against a mock API built from the contract.
[The architecture overview](../overview.md#the-client-path) shows where the two servers sit. The web
client's memory page is the [memory view](../memory/view.md#the-web-view), and the conversation
shows memory writes as [notices](../memory/writes.md#notices).

## The contract

The contract has three kinds of procedure: reads, which a client caches; checked actions, which
change state; and the live stream of log records.

- **Checked actions.** A client creates an ID once per action and sends it again on every retry, so
  the server applies the action once and answers a retry with the first result, or with a fresh
  secret that replaces the first where nixie keeps only a hash
  ([the API](./api.md#checked-actions)). A message send uses its client message ID as that ID. The
  server refuses an ID that arrives again with a different input with `CLIENT_ACTION_ID_REUSED`.
- **Sessions.** Every procedure except enrolment declares `UNAUTHORIZED` for a call without a valid
  device session. Enrolment turns a one-time code into a session, delivered as an `HttpOnly` cookie
  to a browser and in the response to the Android app. The server keeps only a hash of each token,
  so a retried bearer enrolment receives a fresh token for the same session.
- **The client header.** Every call carries a custom client header, and the API refuses a call
  without it, because a cross-site form cannot send a custom header.
- **The live stream.** A conversation read returns a page of records with the log sequence it read
  at. The client follows the log from that sequence, and each streamed event's ID is its record's
  sequence, so a reconnect resumes with no gap and no repeat. A `log_reset` record on the stream
  means the [reset](../core/event-log.md#the-reset) removed every record before it, or a reset of
  the conversation shredded every record before it on the thread, so the client drops what it read
  before that record and reads its queries again. The conversation shows the record as a rule across
  the feed with the time of the reset in the user's own time zone. The server restarts after a
  reset, so the client reads them once more when the stream next connects.

A client renders a record by its kind, and shows a kind it does not know by its name. Beside its
kind, a record carries what a client shows of it: a message's text, the task and step of a task
record, and the tool and input of a tool call or the outcome and content of its result, joined by
the call's ID. Text and content arrive only while their key exists, so a forgotten tool call keeps
its tool and outcome with no content. Once released, the contract only grows: a release adds
procedures, optional input fields, output fields and enum members, and never removes or renames one,
because a client from an older release keeps calling the newer server.

The contract package also holds the TanStack Query helper, with every query key under `nixie`. Each
client builds its own oRPC client and link, so the transport and the session handling stay in the
client. The package declares itself free of side effects, so a client that imports only the helpers
and the contract types bundles none of the schemas.

## Session forwarding

The browser and the Start server both call the API, and both carry the browser's own authority and
nothing more. In the browser, the client calls `/rpc` on the page's own origin, sends the client
header, and lets the browser attach the session cookie. No client script reads or sets that cookie,
because the API sets it on enrolment. On the server, the client reads the session cookie of the
request it is rendering and sends it to the API's private URL as a bearer token, with no credential
of its own. Start scopes the cookie read to the current request, so one server client serves every
request without crossing sessions, and the API checks every call the same way, whichever side it
comes from.

When the API refuses the session as the page loads, the page renders the enrolment form instead of
an error, and a successful enrolment loads the page again with the new cookie. The browser makes
that decision, never the server render. A browser can leave the session cookie off the first request
of a page, so a refusal during the server render renders an empty page, and the browser calls the
API again with its own cookie before it shows the conversation or the form.

The web server answers two health endpoints before Start sees the request. Liveness returns 200
while the process serves requests. Readiness calls the API with no session and returns 200 when the
API answers, with a result or with its typed refusal, because either shows the API is up and speaks
the contract. It returns 503 on any other outcome. Every page Start renders is marked private and
uncacheable and varies by cookie, because a page holds the conversation of the session that asked
for it. The build bundles every dependency into Start's server entry, so the web image holds Bun and
the build output only, and it runs as an unprivileged user.

The web client is installable as an app. Every page links a web app manifest, which holds the app's
name, nixie, a standalone display with no browser bar, and the dark theme's canvas colour. The
manifest and its icons keep fixed names, so the web server lets a browser keep them for a short
while only, and an installed app picks up a changed icon. The client registers no service worker,
because Chrome offers its install from the browser menu without one, and the client has no offline
mode for one to serve.

## The conversation view

The conversation view merges three sources into one list:

- the page of records that the conversation read returned
- the records the live stream delivers after that page, each sequence shown once
- the messages this device sent that the list does not show yet, from the outbox

The page never refetches while the view shows: the live stream keeps it current from the sequence it
was read at, and a dropped stream reconnects from the last sequence it delivered. Leaving the view
drops the page with the stream's records, so a return reads a fresh page and never shows the text of
a message forgotten in between.

A live stream can die without the browser seeing it close, as when a phone sleeps or a proxy loses
its upstream, so the client watches for that. The API writes a keepalive into a quiet stream, and
the client fails a stream that misses three keepalives in a row and follows again. A page that
becomes visible again, or a browser that comes back online, ends the open connection or the pause
before a reconnect and follows again at once, because those are the moments a connection most often
died unseen or the network came back.

A stream that fails attempt after attempt backs off: the pause before each reconnect doubles up to a
cap. The API checks the session before it opens the stream, so a stream that opens is one the API
accepted, and only an open stream resets the backoff, unless the API then ends it with an error.
After a few failures in a row the page says live updates are unavailable, so a stream that a content
blocker, a down server or a revoked session stops fails visibly. The notice goes once the stream
opens again.

The page also says when nixie is failing to answer: the conversation's last step failed and its
errors in a row reached the limit at which another task would fail. A turn that
[the model API refused](../core/conversation-turns.md#a-call-the-model-api-refuses) shows the notice
at its first failure, with the cause in plain words, such as "Claude quota reached". The notice
gives the time of the next try, or says that the turn waits for the user's retry. It sits below the
conversation, next to the newest message, with a Retry button that runs the failed turn again at
once. The notice goes once a step commits or the user retries. The page reads all of it from the
failed step's record, which holds the errors in a row, the limit, the reason and the retry time, or
that the step waits for a retry. A long step can push that record off the newest page, so the page
read also returns the thread's newest step end, and the notice reads it beside the records. A failed
compaction gets a notice of its own, with the count of failures in a row, because turns go on while
it fails and the conversation stops only once the context is full
([compaction](../core/compaction.md#failure-and-overflow)). The notice goes once a summary commits,
a forget invalidates the session or a new session opens.

Each message stands on its own line, a reset stands on its own line too, and every other record
folds into the step it belongs to, from the step's start to its end. A message inside a step splits
the step into segments, with the message between them. The first segment keeps the step's header,
and the last keeps its status, duration and error. Records after the last message that show nothing
of their own, such as the turn end and the step's end, stay with the segment before it. A record
before a step, such as the task's creation, folds into the step that follows it. A page holds only
the thread's newest records, so it can start partway through a step: a step's end with no start
before it closes the records before it as one step, with the status its end records.

A step shows as one collapsed line of short facts: its task, whether its turn ended with no reply,
how many memories its recalls delivered with how many of them the model rated as noise, each tool it
called with its targets, such as the host and path of the page each web fetch ended at, how full the
context stood at its last model call against the window nixie compacts within, and how long it ran.
A fact shows only once its record exists.

Each compaction in the step adds a marker under that line with the context's tokens before and
after, so the user can compare the turns on each side of it. A summary that closed the session shows
as a rule across the feed with the context's size before it and the summary's own size, and opens to
the summary's text while a forget has not erased it.

Opening the step shows one collapsible section per source: the step with its records, the memories
with each one's match score and the first line of its text, the context with each compaction, each
call with its input and its result, and a failed step's error. Each section opens on its own. A
recall record holds no text, so the memories section reads the texts each time it opens, and a
memory forgotten since then shows as forgotten. A long value shows its start and opens in full on
demand, because a fetched page's text runs to many kilobytes. Its toggle sits above the text and
sticks to the top of the view while the text scrolls past, so the user closes an open value without
scrolling back to find the control.

Each message carries a forget control, which first asks and forgets only on the confirm. The result
of a tool call on the conversation thread carries one under its Result line, and a task's records
carry none. A confirmation keeps one client action ID, so a confirm that fails and goes again
forgets once. A forget that fails after its start record dropped the text keeps its control and its
error, so the user can confirm again and finish the cleanup. A message whose text is gone for
another reason, such as a
[reset of the conversation](../core/event-log.md#resetting-the-conversation) or a key that fails to
decrypt, leaves the view with no placeholder. The view drops a message's text when a forget record
that names it arrives, and shows the message as removed on every device, such as "nixie — removed",
with no text and no forget control. A read shows the same line for a record the server marks
removed. A tool call whose record is removed shows its name with "removed" and its result line,
without its input or content, and the view drops the input and the content of a tool record when the
forget record that names it arrives. After a forget, one line takes the place of the control and
states the key backup state of the forget: off, pending, failed, complete or unknown, worded as the
[host commands](../deployment/host-commands.md#the-reset) word a reset's line. The removed record
stays in view with that line until the view reloads.

A reply that a void record names, or that sits in a step which ended in an error or an interruption,
shows muted, with the label "Not sent: this attempt failed, and Nix tried again" and the step's
cause when the client knows it. It has no retry control. A voided reply never counts as the answer
to a message of the user's, so the spinner keeps showing, and a sent file never shows under it.

The view shows each reply as its record arrives, while the turn still runs, in the order of the
records. A message of the user's that lands while the model writes a reply sorts before that reply.

A file that a step sent with [`file.send`](../connectors/code-tool.md#sending-a-file) shows under
the last reply of that step, or under the step when it made no reply. A task's sent files show on
that task's page. The view shows an image inline only when its type is PNG, JPEG, GIF or WebP, the
types that nixie sniffs from the bytes, and a tap opens it full size in a dialog. Every other type,
SVG and HTML included, is a chip with the file's name and size that downloads it. The bytes come
through `files.read` as a blob, so the view never navigates to a file and never opens one in a tab,
because a program wrote the bytes and the page's own origin would load them. The caption shows below
as plain text. A forgotten file shows its name and size with "Forgotten", and a missing one with
"Unavailable".

A reply renders as Markdown, and the user's own message shows as typed. A reply can quote fetched
web text, so the renderer never turns raw HTML into markup, shows a link with an unsafe protocol
such as `javascript:` as plain text, and shows an image as a link to it, because a loaded image
would tell the page's host that the user read the reply. An image inside a link shows as that link's
label, because an anchor inside another anchor breaks the outer link. Every link to another page
opens in a new tab with no opener and no referrer, and a footnote link jumps within the reply.

The view fills the window, and the message box stays in view below the list. The list opens at its
end. When a record or a message arrives, the view moves to the end if the user was at or near it
when they last scrolled, and stays in place if they scrolled up to read. A view at its end stays
there when it shrinks, such as when the message box grows, because a resize moves no scroll
position. The user's own message always brings the view to the end. Below the list, a small spinner
shows while nixie works: from a sent message until a reply follows it or a step fails or stops, and
while any step runs. The spinner keeps its slot when it goes, so the list never jumps. A message
that failed to send stops the spinner, because it waits on the user and not on nixie. Styles come
from Panda CSS with its own presets, and they set only what reading needs: a readable column width,
spacing between records, wrapping for a long word or link, and the colours of a light and a dark
theme.

The theme follows the system's light or dark setting until the user picks light or dark in the theme
picker, and the device keeps that choice in local storage. The colours are tokens with a light and a
dark value, and every text colour meets WCAG AA contrast on the backgrounds of its theme. The server
cannot read local storage, so a script in the document's head sets the theme on the page before the
first paint, and a dark page never flashes light. While the choice is the system's, the page follows
a change to the system setting without a reload. The build runs the React Compiler, so no component
memoizes by hand.

Voice typing in the message box comes from the device's keyboard, and Chrome on Android lets a
keyboard's voice input reach a page only when the page's site holds the microphone permission. The
client records no audio of its own, so a control in the conversation header asks for that permission
once, when the user taps it. The control opens the microphone, stops every track at once and keeps
nothing. It shows the permission's state, which it reads from the browser and follows as it changes:
on, not asked, or blocked with the steps to unblock it. Chrome refuses with the same error when the
user blocks the prompt and when they only close it, so after a refusal the control reads the
permission again to tell the two apart. An installed app shares the site's permissions in Chrome, so
one grant covers the app and the browser tab, and the web server sends no Permissions-Policy header
that could block the microphone.

### Worker runs and large payloads

A step with a `worker.run` call shows one worker line in its tools section, apart from the step's
own tool calls. A worker record joins the call whose `callID` it carries. A tool call or result
whose `toolCall.runID` is the worker run's ID belongs to the line, so the step leaves it out of its
calls, its tool count and the tools its collapsed line names. A worker record whose call is not on
the page shows by its kind, as any record with no renderer does.

- The collapsed line shows the worker run's short ID, the start of the question, the outcome, and
  the minutes, turns, tokens and dollars of the run's end record. Before the end record, it shows
  `running` with the turns and dollars so far.
- The open line shows the question, the answer, each tool call of the worker as a source with the
  target the step line shows, and each turn with its tokens, dollars and text. An outcome other than
  `answered` shows its limit or detail.
- The answer and each turn's text came from a model and from pages it read, so the line shows them
  as plain text.
- A forgotten question, answer or turn text shows as forgotten, and the line keeps its usage and
  outcome.
- No line offers its raw record. A record kind with no renderer shows by the kind's name.

The client sets `clipPayloads` on each conversation read and on the live stream, so a task's page
and the conversation's page both show cut values. Each component that shows a cut value, which are
the step's tool calls, the worker line and the sent message block, shows it as cut with a control
that calls `records.readPayload` and shows the whole value in its place. The client keeps a loaded
value in the view's memory only, and drops it when the stream brings a forget of its record or a log
reset. When the read fails, the control shows the failure with a retry and the cut value stays.

## The ended runs and definitions routes

`/tasks/ended` lists the ended task runs from `tasks.listEnded`, newest first, with a control for
the next page. Each task run links to its task's thread and, when a fire started it, names the fire.
The route also shows the trigger report from `triggers.report`, with each late fire and each skipped
fire and its reason or lateness. The report starts a week back, counted on the browser's calendar.

`/definitions` lists each definition from `definitions.listTasks` with its name, rendered trigger,
next fire, origin, whether it is enabled, and the kind and sequence of the record that created it. A
definition that nixie made has an undo that calls `definitions.undo` as the conversation's notice
does and shows a refusal beside the control. The control reads the creating record to get the change
ID the undo names. A definition whose content is lost shows the marker for missing content, and a
definition's name shows as plain text.

The conversation renders a `definition.changed` record as a notice, such as "Scheduled: Water the
tomatoes, every Friday at 08:00 (next: Fri 12 Mar)", with an undo control. The control shows while
the change is in force or adopted. Once the change is superseded or retired, the notice shows its
state in place of the next fire and offers no undo. A notice whose content is lost shows the marker
for missing content in place of the name and the trigger, and keeps the undo while the state allows
it. A refused undo shows one sentence for the error's code beside the notice, and the sentence for
`REPLACED` names the short ID of the head change.

Both routes follow the live stream, which starts at the head the task list read. `/tasks/ended`
reads again on a `trigger.fired`, `trigger.skipped` or `task.run_ended` record, and `/definitions`
on a `definition.changed` record, so neither polls.

## The files page

`/files` lists the files that code runs wrote, from `files.list`, newest first, as a grid of tiles.
A tile shows the file's name, short type, size and date, and links to the task that made it: a
task's name links to its page, and the conversation links to `/`. A file that `file.send` sent
carries a "Sent to you" mark. Three toggle buttons, All, Images and Other files, set the `kind`
search parameter, so a reload keeps the filter.

- An image tile loads its bytes through `files.read` only when the tile scrolls into view, and a tap
  opens the full size in the image viewer. Any other tile shows no preview. The page keeps each
  file's bytes as a blob and never navigates to them.
- Each tile has a Download button, which saves the blob through a download link.
- The grid loads a page of 30 files, then the next page when its end scrolls into view and when the
  user presses Load more. A page can hold fewer than 30 files while more remain.
- A forget on a tile is a forget of the code run's `tool_result` record, so the tile says that it
  forgets the whole run: its output and all its files. After it, the page drops every tile of that
  run and reads the list again.
- An empty gallery says that files appear when nixie runs code that writes them, and a filter with
  no match says so.

## The app shell

Every page sits in one shell, which the root route renders. Its bar holds 10 links: Conversation,
Memory, Proposals, Moments, Tasks, Ended runs, Files, Definitions, Reminders and Passkeys. The link
of the current page carries `aria-current="page"`, and a detail page marks its parent, so a task
marks Tasks. A page with no entry, such as the mandates page, marks nothing. Below 768px the links
fold into a menu button that opens a side drawer. The drawer is a native modal dialog, so the rest
of the page goes inert while it is open. It closes on a link tap, on Escape and on a tap outside it,
and focus returns to the menu button. CSS alone switches between the bar and the button, so the
server render matches the client. The conversation fills the height below the bar.

## Approvals

A proposal shows as a card, in the conversation under the record that created it and on the
approvals page at `/proposals`. The card's text and state come from the proposal's row, read through
`approvals.readProposals`, and never from a model's reply, so a reply that claims the action is done
leaves the card pending.

A rule's [sentence](../policy/rules.md#rendering) marks its outcome with `**` and each value with
backticks. The client shows the outcome in bold and each value as code wherever it shows a rule: the
sentence of a rule change or a mandate, a mandate's rule fields, the rule that Always allow adds,
and the mandates page. An action's sentence and a memory proposal's text stay plain, because they
can hold the user's own words.

The card shows the approve label on its Approve button, and offers only the choices the host lists.
A lifting row shows the rule's bounds before Approve takes effect. Always allow shows the rule it
adds on the card, and after it the card shows "Rule added" with Undo, and Edit when the rule has
more than one destination. Undo and Edit call `rules.removeRule` and `rules.editRule`. Defer offers
an hour, this evening, tomorrow morning and a custom time within the host's limits, from the
settings `listItems` returns. A closed card shows its state and, when another device answered, that
device's name.

A card keeps the body it first showed. When the action hash or the rule hash moves under it, the
card shows a before and after of the changed text, and answers against the hashes the host holds
now, so one more tap approves what the user saw last.

The approvals page lists the groups of `listItems` and keeps a row that leaves the list as a
collapsed line with its state. "Approve selected" and "Approve all routine" send `answerProposals`
for routine action rows against the hash the page first showed, in calls of at most 100 answers, and
each row settles alone. Memory, always-ask, lifting and deferred rows never join a batch. The
Deferred group is collapsed.

## The task dashboard

The dashboard at `/tasks` lists every open task in three groups: the conversation, the working tasks
and the held tasks. The conversation is the task with the ID `conversation`, and it stays in its own
group in every state, a pause of nixie included. The other tasks group by their listed state, the
state that the API's `tasks.list` gives in `listedState`. Working holds `ready`, `running`,
`waiting`, `idle`, `asleep` and `finished`, and Held holds `paused`, `stopped` and `failed`. A
`done` or `closed` task leaves the list. A task from a server that gives no listed state groups and
shows by its stored state.

Each task shows its name, which links to its page, its state, the time of its last activity, its
brief, the task it waits on, the tasks that wait on it, and how many of its actions are queued and
started. The page also adds these lines, in the browser's time zone:

- On a definition's task with a fire, "Scheduled" and the scheduled time. For a catch-up fire, the
  line adds how late the fire fired, from `firedAt` less `scheduledFor`. A task that a held state
  holds shows the fire of its newest task run. A task run that a poll fired shows no fire, because a
  poll has no schedule to be late against.
- On an `asleep` task with a `nextRunAt`, "Next run" and that time.
- On a `finished` task, "Sent its report".

The dashboard filters by definition and by state. Each filter is one select with an All option, so
it takes one value. The route keeps them as the search parameters `definition` and `state`, so a
reload or a shared link keeps them, and it drops a state that is not one of the 11 listed states.
The definition filter lists each definition that has a task, by its name, from
`definitions.listTasks`. It shows only while a listed task has a `definitionID` or a filter is set,
so a server that gives no `definitionID` shows no definition filter. The filters go into the
`tasks.list` input, so the server filters before its cap. With a filter set, the dashboard shows
only the groups that hold a match, and a Clear filters button. With no match, it shows the
empty-group text.

The dashboard reads the task list and follows the live stream of every thread from the log sequence
the list was read at. Each record that moves a task's state or last activity, such as a pause, a
message of the user's or a `trigger.fired`, makes the dashboard read the list again. The live stream
carries no pause or resume of nixie, and a task that wakes on a schedule changes with no record of
its own, so the dashboard also reads the list on a timer, `taskListRefetchMs`, while the page is
visible, and at once when the page becomes visible. A dropped stream reconnects from the last
sequence it delivered, as the conversation view's stream does, so the dashboard misses no change.

Each task shows the controls that its runner offers and its state allows, as
[controlling a task](./api.md#controlling-a-task) describes. Each control is a checked action, so a
retry after a failure sends the same client action ID. A pause of a running task shows as requested
until its step ends. A stop first lists the actions it cancels and the started ones that run to
their outcome. The dashboard offers the confirm only once that list loads, so the user never cancels
an action unseen. A close asks first too, because a closed task takes no more messages. The
conversation offers no close.

While nixie is paused, every signed-in page shows a banner with the cause in words, a restore, you
or the spending limit, and since when, beside a Resume nixie button that acts at once. A restore
pause also lists each task that the restore left to check, with a link to the task, its state at the
backup, whether a step was running, and its actions without an outcome. The client polls the pause
state on a timer and when the window gains focus, and reads the task list again when that state
changes. The dashboard shows a Pause nixie button while nothing pauses nixie, and neither button
asks to confirm.

A ready, running, waiting or paused task that nixie's pause stops shows as paused by nixie, and its
listed state is `paused`. It offers its own Resume, which runs that task alone. A done, stopped,
failed or closed task shows its own state and no extra Resume.

A task's page at `/tasks/<task_id>` shows that task's thread in the conversation view, under a
header with the task's name, state and controls. The page reads that task on its own and never from
the task list, which keeps only the most recently active tasks. Its composer sends to that thread,
so a message sent there lands in the task's inbox and never in the conversation's. The composer
shows only once the task's read succeeds, so a closed task's page keeps its thread readable with no
composer, and a failed read shows the failure with a retry.

The header shows the task's brief, the prompt the task started with, cut to 2 lines, and a button
that opens the whole brief.

A [task message](../core/task-messages.md) shows in both the sender's thread and the receiver's. The
conversation view shows each message that the conversation sent or received as one line, such as
"Received a message from Garden plan", which links to the message in the other task's thread. A
task's page shows each message as a framed block with the other task's name, the message's kind, its
hop and its whole text, and with a mark when the message woke nobody. The message record lands only
in the receiver's thread, so the sender's thread shows the message from the sender's call of the
message tool, whose input holds the receiver and the text and whose result holds the message ID. A
received message whose text a forget erased shows as forgotten, and a sent message whose call input
a forget erased leaves the thread. The exchange notice that the hop limit writes on the sender's
thread shows who waits on whom, with a link that opens the receiver's page at the message that woke
nobody, or the conversation's page when the conversation receives it. That page reads earlier pages
of its thread until it holds the message, because its first page holds only the newest records, and
then scrolls to the message. A failed read stops the reading and offers a retry, and only that retry
reads the page again. A stop shows as a marker that lists the actions it cancelled.

## The outbox

Every message gets its client message ID and its written time when the user sends it, and the outbox
keeps it in local storage until the server confirms it. A send that the API refused shows as not
sent with a retry control, and goes again under the same ID. The server writes a message once per
client message ID, so no retry can write it twice.

A send that the API did not answer, because the network or the server is down, retries on its own
under the same ID. The pause before each try doubles with each failure in a row up to a cap, and the
message shows when the next try goes, beside the retry control. A browser that comes back online, or
a page that becomes visible again, retries each waiting send at once, because a phone that slept can
miss the moment the API came back.

A message older than the stale limit never goes on its own, because what it says may no longer hold.
A page load sends each stored message under the limit, and holds an older one as not sent, with how
long ago the user wrote it and a choice to send or discard it. Each send checks the message's age
again when its turn in the queue comes, and holds a message that passed the limit while it waited. A
message the user chose to send keeps retrying whatever its age. A stored message from before the
outbox kept the written time counts as stale. Discarding a message removes it from memory, local
storage and IndexedDB, as a forget does. Tabs share the list of discarded messages, so a send that
waits in any tab's queue never sends a discarded message.

The outbox sends one message at a time, in the order the user sent them, because the API writes
records in arrival order and two sends at once could land out of order. Every tab shares the
outbox's storage. A tab's write keeps every stored message the tab does not hold, and drops only the
messages that tab saw confirmed, so a tab never erases another tab's unsent message. Storage
outlives a release, so the outbox drops a stored message that no longer fits the contract's send
input.

When a forget drops the text of a message this device sent, the outbox removes the message from
memory before the page paints, so it never shows the text again as a sent message. Every storage
write leaves out the forgotten message, whatever status a render in flight gives it, so a page load
never sends the message again.

A reset removes every message before it, so when a reset arrives on the live stream, the outbox
removes each message it holds in the same way as a forgotten one, and stops its retries. A message
the API confirmed at a sequence after the reset's stays. The log's sequence orders the two, because
the device's clock and the server's can disagree. A reset that a page read returns removes nothing,
so a reload never drops a message written after it.

A message's images go to IndexedDB under its client message ID, because local storage holds only
strings and too few of them for an image. Local storage keeps the text and the count of images, and
a send reads the images back in their order before it goes. A send that reads back fewer images than
the count fails without reaching the API, because the API keeps the first send under a client
message ID, and a send without the images would lose them for good. A retry reads them again. The
outbox removes a message's images once no stored message holds its ID, so a confirmed or forgotten
message leaves no image on the device.

## Images

The user attaches an image from a camera picker, a photo picker, a paste or a drop onto the message
box. Both pickers stay disabled until React hydrates the page, because the server render shows them
before the page listens for a pick. Each path passes the file through one normalizer before the
composer holds it. The normalizer decodes the image in the browser, scales its long edge down to the
contract's limit, and encodes it again, as PNG for a PNG, GIF or WebP and as JPEG for anything else.
Encoding again drops the EXIF data, a photo's location included, and the device keeps only the
scaled copy. A HEIC photo converts only where the browser decodes HEIC, as Safari does; elsewhere
the composer leaves the image out and says so. The composer refuses an image past the contract's
count, and one still past its size once scaled, with a notice in place of an error from the API. It
scales the picked images one at a time and stops once the free slots hold images that read and fit,
so a large selection never decodes every photo at full size before Send works again.

The composer shows each attached image as a thumbnail with a control that removes it, and the outbox
shows the same thumbnails while a message waits. The thread reads each image of a sent message
through the conversation's image read, which returns the bytes from the record's
[attachments](../core/erasable-fields.md#keys), and says the image is unavailable once a forget
makes them unreadable. The API checks the count, the size and the type again from the bytes, because
a client other than the web app skips the normalizer.

## Paste spans

The message box labels every span of its text with how it arrived: typed, pasted, dropped or
unknown. Memory evidence needs text the user typed, so every path that cannot tell fails closed to
unknown. The labelling logic lives in the contract package, so every client shares it.

1. Before each edit, the client records the browser's input type, the text it inserts and the text
   box's selection. Undo, redo and any input type the logic does not list map to unknown, because
   they restore or insert text without saying where it came from. A single typing or composition
   event that inserts more than one word maps to unknown too. An Android keyboard's clipboard chip
   and its own undo insert pasted text that way, and its voice typing sends each recognized phrase
   as one composition, while typing, a prediction or a swipe inserts one word at most. A dictated
   single word counts as typed, because no field of the event marks dictation. One exception: Gboard
   splits a run-together word by deleting it and inserting it again with a space. The logic keeps
   the typed text that a delete removed until the next edit, and an insertion of several words at
   that place, holding the same characters apart from whitespace, counts as typed. That rule lets no
   character count as typed unless the user typed it one edit earlier.
2. After the edit, the logic applies it at the recorded selection. The selection pins where the edit
   happened, so a paste next to repeated text keeps its label.
3. An insertion that does not replace exactly the selection, such as a spelling fix elsewhere in the
   box, falls back to a plain diff, and its inserted text counts as unknown. An edit with no
   recorded input falls back the same way, so a client discards its recorded input after each edit.

Offsets count UTF-16 code units, as JavaScript string indices do, and an edit boundary never splits
a surrogate pair. The web client listens for the browser's native input event, because React's
synthetic event drops the input type. The logic needs only the two strings and the recorded input,
so a client without the browser's input events records the input from its own paste hook.
