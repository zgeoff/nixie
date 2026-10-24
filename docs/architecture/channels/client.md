# The client

The user reaches nixie through a client that calls one typed API, an oRPC contract in
`libs/contract`, under [0029](../../decisions/0029-channels-and-clients.md). The contract holds
schemas, types and pure functions and no server code, so every client depends on it and the server
validates every input and output against it. The web client in `apps/web` is a TanStack Start server
with its own process and image beside the API, and it renders the conversation from the log as it
grows. [The API](./api.md) covers the server that serves the contract, the
[client design](../../design/platform/channels/client.md) covers the Android app, and the web
client's tests run against a mock API built from the contract.
[The architecture overview](../overview.md#the-client-path) shows where the two servers sit. The web
client's memory page is the [memory view](../memory/view.md#the-web-view).

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
errors in a row reached the limit at which another task would fail. The notice gives the time of the
next try, and goes once a step commits. The page reads all of it from the failed step's record,
which holds the errors in a row, the limit and the retry time. A long step can push that record off
the newest page, so the page read also returns the thread's newest step end, and the notice reads it
beside the records. A failed compaction gets a notice of its own, with the count of failures in a
row, because turns go on while it fails and the conversation stops only once the context is full
([compaction](../core/compaction.md#failure-and-overflow)). The notice goes once a summary commits,
a forget invalidates the session or a new session opens.

Each message stands on its own line, a reset stands on its own line too, and every other record
folds into the step it belongs to, from the step's start to its end. A record before a step, such as
the task's creation, folds into the step that follows it. A page holds only the thread's newest
records, so it can start partway through a step: a step's end with no start before it closes the
records before it as one step, with the status its end records.

A step shows as one collapsed line of short facts: its task, how many memories its recalls delivered
with how many of them the model rated as noise, each tool it called with its targets, such as the
host and path of the page each web fetch ended at, how full the context stood at its last model call
against the window nixie compacts within, and how long it ran. A fact shows only once its record
exists.

Each compaction in the step adds a marker under that line with the context's tokens before and
after, so the user can compare the turns on each side of it. A summary that closed the session shows
as a rule across the feed with the context's size before it and the summary's own size, and opens to
the summary's text while a forget has not erased it.

Opening the step shows one collapsible section per source: the step with its records, the memories
with each one's match score, the first line of its text and the model's rating with its note, the
context with each compaction, each call with its input and its result, and a failed step's error.
Each section opens on its own. A recall record holds no text and a rating record holds its note
sealed, so the memories section reads the texts and the notes each time it opens, and a memory
forgotten since then shows as forgotten. A rating can arrive in a later step than the recall it
rates, and the view shows it beside the memory in the step that recalled it. A long value shows its
start and opens in full on demand, because a fetched page's text runs to many kilobytes. Its toggle
sits above the text and sticks to the top of the view while the text scrolls past, so the user
closes an open value without scrolling back to find the control.

Each message carries a forget control, which first asks and forgets only on the confirm. A
confirmation keeps one client action ID, so a confirm that fails and goes again forgets once. A
forget that fails after its start record dropped the text keeps its control and its error, so the
user can confirm again and finish the cleanup. Any other message with no text leaves the view, with
no placeholder, whether a forget or a
[reset of the conversation](../core/event-log.md#resetting-the-conversation) shredded it. The view
drops a message's text when a forget record that names it arrives, so the message leaves the view on
every device.

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
box. Each path passes the file through one normalizer before the composer holds it. The normalizer
decodes the image in the browser, scales its long edge down to the contract's limit, and encodes it
again, as PNG for a PNG, GIF or WebP and as JPEG for anything else. Encoding again drops the EXIF
data, a photo's location included, and the device keeps only the scaled copy. A HEIC photo converts
only where the browser decodes HEIC, as Safari does; elsewhere the composer leaves the image out and
says so. The composer refuses an image past the contract's count, and one still past its size once
scaled, with a notice in place of an error from the API. It scales the picked images one at a time
and stops once the free slots hold images that read and fit, so a large selection never decodes
every photo at full size before Send works again.

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
