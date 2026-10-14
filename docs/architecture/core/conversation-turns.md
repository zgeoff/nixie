# Conversation turns

The conversation answers the user one turn at a time. Each turn is one step of the conversation
task: the step hands the task's unread inbox to a model loop, the loop runs on the Agent SDK in a
long-lived sandbox, and the step commits the loop's replies and the point the loop's session
reached. The event log is the record of the conversation, and the SDK's session transcript is a
cache that makes the next turn cheaper. [Tasks](./tasks.md) covers steps and their commits,
[model profiles](./model-profiles.md) covers the profile a turn runs on, and
[tool calls](../connectors/tool-calls.md) covers the endpoint that serves the loop its tools, and
[memory in context](../memory/context.md) covers the pinned core and the items each turn places.
`modules/models` holds the host side, `guests/conversation` holds the guest, and the turn frames
between them live in `libs/wire`.

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
and the run's bearer token, which the guest gives the SDK as an HTTP MCP server that must connect
before the loop starts.

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

The history in the session only grows, and the CLI compacts it as it nears its auto-compact window.
A turn after the prompt cache expires re-reads the whole history at the full input price, so the
window comes from the profile's context cap, with a default for a profile that sets none. The CLI
then compacts the session within the cap, and the next turn resumes the compacted history. nixie
builds no compaction of its own.

The guest sets every compaction control in the query's settings rather than leaving it at the SDK's
default, so an SDK upgrade cannot change it. Auto-compaction stays on. Precomputed compaction and
idle compaction stay off, because each would change the session outside a step. A step's commit
records the session's last message as the point that [crash recovery](./leases-and-recovery.md)
resumes at, so the session changes only inside a step that holds the task's lease.

The CLI compacts between model calls inside a turn, and the guest reports each compaction with its
trigger and its token counts before and after. The step writes one compacted record per compaction,
with those counts, the newest recall the compaction summarized and no text. The summary the CLI
writes stays in the session, because the model wrote it from the conversation, and nixie keeps model
text out of its records unless a reply holds it.

## Rebuilding a session

A turn rebuilds its session when it has none to resume: a replacement sandbox whose session copy
failed holds no session, and a forget's session cleanup invalidates it
([forgetting and the live session](../memory/context.md#forgetting-and-the-live-session)). Each
turn-ended record keeps the newest session-invalidated record the turn saw before it ran. The step
resumes no session when a newer invalidation exists, so a step that commits after an invalidation it
never saw leaves the session invalid. When the guest instead reports the session lost, the step runs
the turn again on a rebuilt session.

Every new session's first turn opens with a one-line marker, so the model knows at once that its
context starts there. A rebuilt session's marker says the context was rebuilt, and a fresh session's
marker says the session is new. Both say that earlier history is in the event log. A turn that
resumes its session carries no marker.

A rebuilt session's first turn opens with its marker, the thread's recent turns, then the turn's own
messages. The recent turns are the user's messages and the replies, word for word and oldest first,
newest back to a token budget that the deployment configuration sets. The history leaves out every
message from the turn's first inbox record on, so a pending message reaches the model once, as a
live message. It keeps every committed reply, because a turn that left messages for the next step
commits its reply after them. Older turns reach the new session only through recall. The step writes
a session-rebuilt record that names the lost session, the reason and the count of records the
history holds. The SDK transcript is a cache, so a rebuild restores the conversation's recent
context from the event log rather than an identical session.

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

## Records of a turn

The guest reports each assistant message with its text and the tools it asked for, and ends with the
boundary, the stop reason, the count of model calls, the token usage and the context. The usage sums
every model call in the turn, so it measures cost and not how full the context stands. The context
is therefore the last main-chain model call's input, cache-read and cache-write tokens, beside the
auto-compact window. The step turns these into records on the conversation's thread: a reply record
per message with text, whose text is erasable, and one turn-ended record with the usage and the
context. Each record holds the model ID and the profile's ID from the profile nixie gave the turn,
never from the guest's frames ([model profiles](./model-profiles.md#records-of-model-output)).

The step returns to waiting once it commits, because the conversation always waits for the user's
next message. A turn that fails for any reason but a lost session, such as a disconnected tool
server, throws, so the tasks module records the error and retries the step after a delay that grows
with each failure in a row. The conversation never fails ([tasks](./tasks.md#steps)).

## The events block

The conversation hears of what happened outside it through the events block, which goes before the
user's message on the next turn. The block lists the user's answers to memory proposals, nixie's
restarts and the conversation's own turns that failed and were retried, each after its time, oldest
first, up to a cap and then a count of the rest. A turn after which nothing happened gets no block.
The block reads the same range of the log as
[the memory change note](../memory/writer.md#the-change-note), from the sequence the last turn's
note covered to the log's head, so the next turn's note starts where this one ends and no event
appears twice.

Each kind of event is one entry in a registry: its name, how it reads its events in a range of the
log, and how one event's line renders. The block merges every entry's events by sequence, so a new
kind is a new entry and no change to the block. An entry may also complete the events the block
lists, such as by reading text through recall. The block asks for that only after its cap, because a
recall records what it delivered and the block must never record an event it leaves out. The server
builds the registry when the conversation starts, and each entry's package owns the records it
reads.

- **A proposal answer** reads each proposal the user approved or rejected, from any source, the
  conversation's own included. A listed approval quotes the version it wrote while that version is
  still current, through a recall of that version alone. The recall record then names only the text
  the block shows, which the forget and the retirement gate's read check trust. A rejection quotes
  only the conversation's own proposed edit, which its session already holds. The store reads that
  edit under the delivery lock and only while its item is active or retired, so no text reaches the
  model once a forget of the item began. A rejected new item has no quote, because the rejection
  removes the item's key and its text with it.
- **A restart** reads the record the server writes at each start, with nixie's version and the
  version of the start before it.
- **A retried turn** reads each failure of a conversation step that the task retries, and quotes the
  error when the log still holds its text. A failure that ended the task is not a retry, so the
  block leaves it out.

Each line shows its time in the zone that [the time tool](../connectors/time.md) answers in, which
is the zone of the user's newest message. Each line names the user by the name in the owner section
of the deployment configuration, or calls the user "the owner" when the section sets none.
