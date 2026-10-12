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
becomes visible again, or a browser that comes back online, ends the open connection and follows
again at once, because those are the moments a connection most often died unseen.

Each message stands on its own line, and every other record folds into the step it belongs to, from
the step's start to its end. A record before a step, such as the task's creation, folds into the
step that follows it. A step shows as one collapsed line that names each tool it called with its
targets, such as the host of each page a web fetch read, and opening it shows the task, the step's
records, and each call with its input and its result. A long value shows its start and opens in full
on demand, because a fetched page's text runs to many kilobytes.

The view fills the window. The list scrolls in a reversed column, which starts at its end and stays
there as records arrive unless the user scrolled up to read, and the message box stays in view below
it. Styles come from Panda CSS with its own presets and no theme of nixie's, and they set only what
reading needs: a readable column width, spacing between records, and wrapping for a long word or
link. The build runs the React Compiler, so no component memoizes by hand.

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

1. Before each edit, the client records the browser's input type and the text box's selection. Undo,
   redo and any input type the logic does not list map to unknown, because they restore or insert
   text without saying where it came from.
2. After the edit, the logic applies it at the recorded selection. The selection pins where the edit
   happened, so a paste next to repeated text keeps its label.
3. An insertion that does not replace exactly the selection, such as a spelling fix elsewhere in the
   box, falls back to a plain diff, and its inserted text counts as unknown. An edit with no
   recorded input falls back the same way, so a client discards its recorded input after each edit.

Offsets count UTF-16 code units, as JavaScript string indices do, and an edit boundary never splits
a surrogate pair. The web client listens for the browser's native input event, because React's
synthetic event drops the input type. The logic needs only the two strings and the recorded input,
so a client without the browser's input events records the input from its own paste hook.
