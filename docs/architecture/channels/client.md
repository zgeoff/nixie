# The client

The user reaches nixie through a client that calls one typed API, an oRPC contract in
`libs/contract`, under [0029](../../decisions/0029-channels-and-clients.md). The contract holds
schemas, types and pure functions and no server code, so every client depends on it and the server
validates every input and output against it. The web client in `apps/web` is a TanStack Start server
with its own process and image beside the API, and it renders the conversation from the log as it
grows. [The API](./api.md) covers the server that serves the contract, the
[client design](../../design/platform/channels/client.md) covers the Android app, and the web
client's tests run against a mock API built from the contract.
[The architecture overview](../overview.md#the-client-path) shows where the two servers sit.

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
  sequence, so a reconnect resumes with no gap and no repeat.

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
an error, and a successful enrolment loads the page again with the new cookie.

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

The page never refetches: the live stream keeps it current from the sequence it was read at, and a
dropped stream reconnects from the last sequence it delivered.

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
errors in a row reached the limit at which another task would fail. The notice gives the time of the
next try, and goes once a step commits. The page reads all of it from the failed step's record,
which holds the errors in a row, the limit and the retry time. A long step can push that record off
the newest page, so the page read also returns the thread's newest step end, and the notice reads it
beside the records.

Each message stands on its own line, and every other record folds into the step it belongs to, from
the step's start to its end. A record before a step, such as the task's creation, folds into the
step that follows it. A step shows as one collapsed line of short facts: its task, how many memories
its recalls delivered, each tool it called with its targets, such as the host of each page a web
fetch read, how full the context stood at its last model call against the auto-compact window, and
how long it ran. A fact shows only once its record exists. Each compaction in the step adds a marker
under that line with the context's tokens before and after, so the user can compare the turns on
each side of it. Opening the step shows one collapsible section per source: the step with its
records, the memories with each one's match score and the first line of its text, the context with
each compaction, each call with its input and its result, and a failed step's error. Each section
opens on its own. A recall record holds no text, so the memories section reads the text each time it
opens, and a memory forgotten since then shows as forgotten. A long value shows its start and opens
in full on demand, because a fetched page's text runs to many kilobytes. Its toggle sits above the
text and sticks to the top of the view while the text scrolls past, so the user closes an open value
without scrolling back to find the control.

A reply renders as Markdown, and the user's own message shows as typed. A reply can quote fetched
web text, so the renderer never turns raw HTML into markup, shows a link with an unsafe protocol
such as `javascript:` as plain text, and shows an image as a link to it, because a loaded image
would tell the page's host that the user read the reply. Every link to another page opens in a new
tab with no opener and no referrer, and a footnote link jumps within the reply.

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

## The outbox

Every message gets its client message ID when the user sends it, and the outbox keeps it in local
storage until the server confirms it. A message whose send failed shows as not sent with a retry
control, and goes again under the same ID. A page load sends every stored message again. The server
writes a message once per client message ID, so no retry can write it twice.

The outbox sends one message at a time, in the order the user sent them, because the API writes
records in arrival order and two sends at once could land out of order. Every tab shares the
outbox's storage. A tab's write keeps every stored message the tab does not hold, and drops only the
messages that tab saw confirmed, so a tab never erases another tab's unsent message. Storage
outlives a release, so the outbox drops a stored message that no longer fits the contract's send
input.

## Paste spans

The message box labels every span of its text with how it arrived: typed, pasted, dropped or
unknown. Memory evidence needs text the user typed, so every path that cannot tell fails closed to
unknown. The labelling logic lives in the contract package, so every client shares it.

1. Before each edit, the client records the browser's input type, the text it inserts and the text
   box's selection. Undo, redo and any input type the logic does not list map to unknown, because
   they restore or insert text without saying where it came from. A single typing event that inserts
   more than one word maps to unknown too, because an Android keyboard's clipboard chip and its own
   undo insert pasted text that way, and typing, a prediction or a swipe inserts one word at most.
   One exception: Gboard splits a run-together word by deleting it and inserting it again with a
   space. The logic keeps the typed text that a delete removed until the next edit, and an insertion
   of several words at that place, holding the same characters apart from whitespace, counts as
   typed. That rule lets no character count as typed unless the user typed it one edit earlier.
2. After the edit, the logic applies it at the recorded selection. The selection pins where the edit
   happened, so a paste next to repeated text keeps its label.
3. An insertion that does not replace exactly the selection, such as a spelling fix elsewhere in the
   box, falls back to a plain diff, and its inserted text counts as unknown. An edit with no
   recorded input falls back the same way, so a client discards its recorded input after each edit.

Offsets count UTF-16 code units, as JavaScript string indices do, and an edit boundary never splits
a surrogate pair. The web client listens for the browser's native input event, because React's
synthetic event drops the input type. The logic needs only the two strings and the recorded input,
so a client without the browser's input events records the input from its own paste hook.
