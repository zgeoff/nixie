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
conversation's sandbox when its spec matches the one the profile gives. A changed spec, such as a
new image or a rotated credential, replaces the sandbox, so a turn never runs with a grant for a
profile nixie no longer uses. The sandbox's owner is the conversation task, which never finishes, so
the sandbox outlives each step and the transcripts on its disk outlive each turn.

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

The guest checks the session's opening message, which lists each MCP server's status, and ends the
turn with a failure when nixie's server shows as anything but connected. A loop without its tools
would answer from the model alone, and its replies could claim actions that never ran.

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
default, so an SDK upgrade cannot change it. Auto-compaction stays on, and precomputed compaction
stays off, because it would change the session outside a step. A step's commit records the session's
last message as the point that [crash recovery](./leases-and-recovery.md) resumes at, so the session
changes only inside a step that holds the task's lease.

The CLI compacts between model calls inside a turn, and the guest reports each compaction with its
trigger and its token counts before and after. The step writes one compacted record per compaction,
with those counts and no text. The summary the CLI writes stays in the session, because the model
wrote it from the conversation, and nixie keeps model text out of its records unless a reply holds
it.

## Rebuilding a session

A turn rebuilds its session when it has none to resume: a sandbox that lost its disk, such as one
replaced after a profile change, no longer holds the session, and a forget's session cleanup
invalidates it
([forgetting and the live session](../memory/context.md#forgetting-and-the-live-session)). Each
turn-ended record keeps the newest session-invalidated record the turn saw before it ran. The step
resumes no session when a newer invalidation exists, so a step that commits after an invalidation it
never saw leaves the session invalid. When the guest instead reports the session lost, the step runs
the turn again on a rebuilt session.

A rebuilt session's first turn opens with the thread's recent turns, then the turn's own messages.
The recent turns are the user's messages and the replies, word for word and oldest first, newest
back to a token budget that the deployment configuration sets. The history ends before the turn's
first inbox record, so a message that lands during the turn reaches the model once, as a live
message. Older turns reach the new session only through recall. The step writes a session-rebuilt
record that names the lost session, the reason and the count of records the history holds. The SDK
transcript is a cache, so a rebuild restores the conversation's recent context from the event log
rather than an identical session.

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

## Records of a turn

The guest reports each assistant message with its text and the tools it asked for, and ends with the
boundary, the stop reason, the count of model calls and the token usage. The step turns these into
records on the conversation's thread: a reply record per message with text, whose text is erasable,
and one turn-ended record with the usage. Each record holds the model ID and the profile's ID from
the profile nixie gave the turn, never from the guest's frames
([model profiles](./model-profiles.md#records-of-model-output)).

The step returns to waiting once it commits, because the conversation always waits for the user's
next message. A turn that fails for any reason but a lost session, such as a disconnected tool
server, throws, so the tasks module records the error and retries the step after its delay.
