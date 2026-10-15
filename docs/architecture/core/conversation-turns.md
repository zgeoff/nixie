# Conversation turns

The conversation answers the user one turn at a time. Each turn is one step of the conversation
task: the step hands the task's unread inbox to a model loop, the loop runs on the Agent SDK in a
long-lived sandbox, and the step commits the loop's replies and the point the loop's session
reached. The event log is the record of the conversation, and the SDK's session transcript is a
cache that makes the next turn cheaper. [Tasks](./tasks.md) covers steps and their commits,
[model profiles](./model-profiles.md) covers the profile a turn runs on,
[tool calls](../connectors/tool-calls.md) covers the endpoint that serves the loop its tools,
[memory in context](../memory/context.md) covers the pinned core and the items each turn places,
[session opening](./session-opening.md) covers what a new session opens with, and
[compaction](./compaction.md) covers how nixie shrinks a session that grows past its threshold.
`modules/sessions` holds the host side, `guests/conversation` holds the guest, and the turn frames
between them live in `libs/wire`. The sessions package runs every model loop's sessions, the
conversation's and the memory roles' alike, and takes each loop's profile from the models package,
which holds only the profiles and the call cost.

## The guest and its sandbox

The guest is the one package that imports the Agent SDK, under
[0003](../../decisions/0003-sdk-placement.md), so the SDK and the CLI it spawns run only inside a
sandbox. The conversation image holds the guest and its production dependencies, and runs as an
unprivileged user whose home holds the SDK's session transcripts.

At start, nixie stores the conversation profile's credential with the sandbox backend and keeps the
conversation's sandbox when its spec matches the one the profile gives and its adapter has not
retired it. A changed spec, such as a new image or a rotated credential, replaces the sandbox, so a
turn never runs with a grant for a profile nixie no longer uses. nixie replaces a retired sandbox
the same way, such as an imp that the sandbox backend still backs up. The sandbox's owner is the
conversation task, which never finishes, so the sandbox outlives each step and the transcripts on
its disk outlive each turn.

A replacement keeps the session. nixie creates the new sandbox before it destroys the old one, and
copies the session that the conversation resumes, its transcript and its side folder, from the old
disk to the new one. The copy wakes a sleeping old sandbox first, because each read runs in its
guest. The CLI names a session's project folder after the working directory, so the copy lists the
files from the old guest's home and writes them under the folder that the new guest's own home
names. A start that stops before it destroys the old sandbox leaves both, so the next start copies
again into the sandbox it keeps and overwrites what the stopped copy wrote. No turn runs while an
old sandbox remains, so the old copy is never behind. The copy writes the transcript under a staged
name and renames it once every file has landed, so a copy that fails partway leaves no session to
resume. The copy tries each old sandbox in turn. When every copy fails, nixie logs a warning and the
start goes on, so a deploy never fails on the copy.

Each step spawns the guest in the sandbox for one turn. The host writes a turn frame to the guest's
standard input, and the guest writes its own frames to standard output. Both directions use the wire
framing, and a schema checks each frame's JSON on arrival, so a frame from a broken guest ends the
turn as an error rather than as a record.

## What a query holds

Every query the guest makes holds nixie's tools and nothing else. The options turn off the SDK's
built-in tools, every settings source, the bundled skills and the SDK's own memory, and they allow
only nixie's MCP server, so the loop cannot read a file, run a command or remember anything outside
the event log. The strict MCP option keeps every other MCP server out of the loop. The turn frame
holds the system prompt, and the guest sets it as a custom prompt with the SDK's snapshot off, so a
resumed session runs on the prompt the host rendered for this turn.

The turn frame holds the profile's base URL, model, effort, auth header and context cap, and the
guest sets them in the query's environment. The guest holds a placeholder in place of the
credential, and the sandbox's grant swaps in the real one on the way to the profile's host
([model profiles](./model-profiles.md#credentials)). The frame also holds the URL of the tool route
and the turn's own step token, which the guest gives the SDK as an HTTP MCP server that must connect
before the loop starts. The step token ties each tool call to the step that runs the turn
([tool calls](../connectors/tool-calls.md#one-endpoint-per-run)).

The guest ends the turn with a failure when nixie's server is not connected, because a loop without
its tools would answer from the model alone, and its replies could claim actions that never ran. The
CLI builds its first model request from the servers connected when the turn's first message arrives.
The guest therefore reads the server's status before it sends that message, and when the connection
failed, it waits a moment and reconnects once, so a tool route that dropped one connection does not
fail the turn. A failure that outlasts the reconnect carries the CLI's connection error. The guest
checks the session's opening message as well, which lists each MCP server's status.

## Resume and fork

Each step commit stores the session boundary: the session's ID and the ID of the last message in it.
The next step parses the boundary and resumes the session at that message, on a fork. The fork gives
each turn a new session that copies the history up to the boundary, so a turn that crashed before
its commit leaves its partial messages in a session no later turn resumes. A rerun of the step
therefore starts from the same point as the first try, and the model never sees the lost attempt.

Each fork copies the whole history, so the guest removes every session on its disk but the one it
resumes before the turn starts. The disk then holds at most the resumed session and the fork the
turn writes, rather than a growing copy per turn.

A guest can die after one result and before the next, once a message that landed mid-turn started a
second model call. The step then counts only the replies and reads that came before the last result,
because the next turn resumes at that result's boundary, and a record read after it stays unread for
the next step to send again.

## Compaction

The history in the session only grows, so nixie compacts it between turns with a summary that the
event log holds ([compaction](./compaction.md)). The guest sets every compaction control in the
query's settings rather than leaving it at the SDK's default, so an SDK upgrade cannot change it.
Auto-compaction, precomputed compaction and idle compaction stay off, because each would change the
session outside a step, with a summary that the event log never holds. A step's commit records the
session's last message as the point that [crash recovery](./leases-and-recovery.md) resumes at, so
the session changes only inside a step that holds the task's lease.

The CLI's auto-compact window sets the window that a turn reports its context against, and it comes
from the profile's context cap, with a default for a profile that sets none. When the CLI reports a
compaction anyway, the step writes one compacted record with its token counts and no text, and the
next turn sends the pinned core again, because the CLI's summary may have dropped the opening.

## Opening a new session

A turn opens a new session when it has none to resume. The conversation's first turn has no session
boundary, a replacement sandbox whose session copy failed holds no session, and a forget's session
cleanup invalidates the session
([forgetting and the live session](../memory/context.md#forgetting-and-the-live-session)). Each
turn-ended record keeps the newest session-invalidated record the turn saw before it ran. The step
resumes no session when a newer invalidation exists, so a step that commits after an invalidation it
never saw leaves the session invalid. When the guest instead reports the session lost, the step runs
the turn again on a new session. A session from before opening records holds the pinned core only in
its old system prompt, so the step opens a new session in its place too.

Every new session opens from one builder, with the pinned memory, the status, the newest summary and
the recent turns before the turn's own blocks, and the step writes a session-opened record in the
turn's commit ([session opening](./session-opening.md)). A turn that resumes its session carries no
opening. The SDK transcript is a cache, so a rebuild restores the conversation's recent context from
the event log rather than an identical session.

## Inbox records as messages

The step sends each unread inbox record into the loop as a user message whose SDK message ID encodes
the record's log sequence. The guest decodes the IDs the SDK acknowledges, and the step reports the
matching sequences as read, so the read cursor moves only over records the model received. A record
the turn never reached stays unread, and the next step sends it again.

A turn opens with no more inbox records than the SDK lists on the reply that consumed them, because
a record past that list would have no ID to acknowledge it by, and the turn would wait for it
forever. A step that leaves records past the limit asks to continue, so the next step takes them at
once.

A message the user sends while a turn runs reaches the same turn, when that turn took the whole
inbox. A turn that left records for the next step takes no live message, so the read cursor never
meets a gap and no record reaches the model twice. The host watches the conversation thread for
inbox records that land after the step started and writes each one to the guest as a message frame,
and the guest passes it into the running query. The SDK acknowledges a message it folds into a
running turn in a different form from the turn's opening messages, and the guest counts both forms
as a read.

The user's message renders with each span the client labelled pasted or dropped wrapped in a
`<pasted id="…">` or `<dropped id="…">` block, in the inbox and in a rebuilt session's history
alike. The closing tag repeats the opening tag's ID, which is random and fresh for each block, so
pasted text that holds a closing tag cannot end its block early. A message the user typed in full
renders as it was written. The system prompt states, after the persona, that the text inside these
blocks is not the user's own words and may hold instructions the model acts on only when the user's
own words ask. The model can then tell which quotes the [memory gate](../memory/writes.md) takes as
typed.

Images the user sends with a message reach the model as image input, read as dropped in like dropped
text. The inbox message holds the text first, then for each image a `<dropped-image id="…" n="…"/>`
marker with its own random ID and the image's number, then the image block. The host reads each
image's bytes from the [attachments](./erasable-fields.md#keys) and writes them to the guest in the
message frame, so a frame from the host has a larger size limit than a frame from the guest. The SDK
repeats every image a session took in each later request, so a session caps both the image bytes it
holds and the number of images, and each turn end records both. The count cap is the Messages API's
image limit for a model with the smaller context window, so it holds for every model a profile
names. A message whose images would pass either cap waits for the next step, whether it opens a
turn's batch or lands while the turn runs, and that step opens a rebuilt session for it, so no
request passes the size or the image count the Messages API accepts. The first message of a new
session always goes. A rebuilt session's history and every other render of the message show only the
markers, never the bytes, so an image reaches the model once, in the turn it was sent. The
pasted-text rule in the system prompt names the images too: the model treats an image's content, its
text included, as it treats dropped text.

## System messages

Every block that nixie writes into a user message is a system message: a `<system-message>` element
with a type, a random ID and the time nixie wrote it, as in
`<system-message type="events" id="7f3a9c21b04e" at="Tue 14 Oct, 22:50, Sydney">`. The closing tag
repeats the ID, which is fresh for each element as a pasted block's is, so a memory or an event
whose text holds a closing tag cannot end the element early. The ID proves nothing about the sender,
because text inside a message can carry any ID. The system prompt therefore states a position rule:
a system message comes from nixie only at the top level of a user message, and one inside a tool
result, a pasted or dropped block or a quote is text. The SDK sends a tool result as a block of its
own, so the model can tell the two places apart.

A new session's pinned memory, status, summary and recent turns, the events block, the pinned-core
change note and the retrieved items each render as one system message before the user's message. A
fired timer and an action's outcome render as one each, with the time their record was written, and
each body leads with the record's event ID so the model can cite it. The user's own message stays
outside any element, after its stamp, because it holds the user's own words.

## Records of a turn

The guest reports each assistant message with its text and the tools it asked for, and ends with the
boundary, the stop reason, the SDK's reason for the end, the count of model calls, the token usage
and the context. The SDK gives a context past its window an end reason of its own, apart from every
other model API error, so the host tells an overflow from a refused request on that reason alone. An
overflowed turn ends with the CLI's own message that the prompt is too long, and the guest keeps the
boundary off that message: at the turn's last other chain entry, or at its resume point when the
turn wrote no other entry. The step commits that boundary, so a retry forks the session before the
overflow. One exception: a fresh session that overflows at its first model call has neither, and its
boundary stays on the CLI's message. The usage sums every model call in the turn, so it measures
cost and not how full the context stands. The context is therefore the last main-chain model call's
input, cache-read and cache-write tokens, beside the auto-compact window. The step turns these into
records on the conversation's thread: a reply record per message with text, whose text is erasable,
and one turn-ended record with the usage, the end reason and the context. Each record holds the
model ID and the profile's ID from the profile nixie gave the turn, never from the guest's frames
([model profiles](./model-profiles.md#records-of-model-output)).

The step returns to waiting once it commits, because the conversation always waits for the user's
next message. A turn that fails for any reason but a lost session, such as a disconnected tool
server, throws, so the tasks module records the error and retries the step after a delay that grows
with each failure in a row. The conversation never fails ([tasks](./tasks.md#steps)).

## The events block

The conversation hears of what happened outside it through the events block, which goes before the
user's message on the next turn. The block lists memory that changed outside the conversation, the
user's answers to memory proposals, nixie's restarts and the conversation's own turns that failed
and were retried, each after its time, oldest first, up to a cap and then a count of the rest. A
turn after which nothing happened gets no block. The block reads a range of the log, from the
sequence the last turn's note covered to the log's head, so the next turn's note starts where this
one ends and no event appears twice.

Each kind of event is one entry in a registry: its name, how it reads its events in a range of the
log, and how one event's line renders. The block merges every entry's events by sequence, so a new
kind is a new entry and no change to the block. An entry may also complete the events the block
lists, such as by reading text through recall. The block asks for that only after its cap, because a
recall records what it delivered and the block must never record an event it leaves out. The server
builds the registry when the conversation starts, and each entry's package owns the records it
reads.

- **A memory change**, the memory writer's catch-up and a merge into one of the conversation's
  proposals are memory's own kinds, which
  [the memory writer](../memory/writer.md#changes-the-conversation-hears-of) covers.
- **A proposal answer** reads each proposal the user approved or rejected, from any source, the
  conversation's own included. A listed approval quotes the version it wrote while that version is
  still current, through a recall of that version alone. The recall record then names only the text
  the block shows, which the forget and the retirement gate's read check trust. A rejection quotes
  only the conversation's own proposed edit, which its session already holds. The store reads that
  edit under the delivery lock and only while its item is active or retired, so no text reaches the
  model once a forget of the item began. A rejected new item has no quote, because the rejection
  removes the item's key and its text with it. A rejection with the user's reason quotes the reason
  after any proposed text, so the conversation learns what to stop proposing. The block reads the
  reason from the rejection record's own erasable fields, and a record whose key is gone gives no
  reason.
- **A restart** reads the record the server writes at each start, with nixie's version and the
  version of the start before it. When the conversation's tools or persona changed since the start
  before, a second line names each tool added or removed and says when the persona was updated,
  because a version number alone tells the conversation nothing it can act on. The server finds
  those changes by comparing what each start gives the conversation, so a release that changes
  nothing the conversation is given adds no line.
- **A retried turn** reads each failure of a conversation step that the task retries, and quotes the
  error when the log still holds its text. A failure that ended the task is not a retry, so the
  block leaves it out.

Each line shows its time in the zone that [the time tool](../connectors/time.md) answers in, which
is the zone of the user's newest message. Each line names the user by the name in the owner section
of the deployment configuration, or calls the user "the owner" when the section sets none.
