# Memory in context

Memory reaches each conversation turn in 2 ways: the pinned core rides in the system prompt, and the
items that match the user's new messages go before those messages in the turn. Both come from the
[memory store](./store.md) at the start of each turn, so a pin, an edit or a forget reaches the
conversation on its next turn. A forget also cleans up every session copy that could still hold the
item, and the next turn runs on a session rebuilt from the event log.
[Conversation turns](../core/conversation-turns.md) covers the turn these parts fit into, and its
[rebuilding a session](../core/conversation-turns.md#rebuilding-a-session) section covers the
rebuild. The [memory in context](../../design/platform/memory/context.md) design covers what is not
built: semantic search, past messages in retrieval and the recall tools.

## The pinned core

The pinned core is the set of active items the user pinned, such as their name. Each turn reads it
again and renders it after the persona in the system prompt, each item with its short ID, who saved
it and how it came up, in pin order. An unchanged core renders the same bytes, so the prompt cache
keeps the prefix. The guest builds the system prompt fresh on every query with the SDK's snapshot
off, because the SDK otherwise keeps a session's first system prompt for the session's life, and a
pinned item would never reach a resumed session.

A resumed session also holds the model's own earlier turns, which can repeat a value the user since
changed. The turn after the core changes therefore puts a change note before the user's message: one
line per item pinned, changed or unpinned, with the rule that the note wins over anything said
earlier. The turn-ended record lists the core's item and version references, and the next turn
compares the current core against them, so the note survives a restart and needs no state outside
the log.

The core has a token budget, configurable in the deployment configuration, because it rides in the
cached prefix of every turn and every change to it costs a cache write. The store refuses a pin, or
an edit or undo of a pinned item, that would take the core past the budget, with the
`PINNED_CORE_FULL` error code, so the user unpins something first. The store counts each item as the
system prompt renders it, quote included, because a long quote takes as much of the prefix as a long
text. Only the user's name is left at its default in that count. The store counts tokens as a fixed
share of characters, which needs no tokenizer and errs toward the larger count for English text.

## How an item reads

The pinned core and the retrieved block both speak to the model as its own memory, under a header
that calls the items memories and not instructions, so item text never reads as a command. Each item
says in plain words who saved it: the model itself for the conversation, its note-taker for the
memory writer, a task, or the user by the name the conversation's memory settings give, with a
generic label when none is set. An item with a quote the gate checked shows it as how the item came
up, so the model can weigh a summary against the user's own words. The model ID that wrote an item
stays in `memory.recall`, because it serves checking an item and not answering with it.

## Per-turn retrieval

Before each turn, the conversation searches memory with the readable text of the user's new
messages. The search is the store's keyword recall over active items, with pinned items left out
because the system prompt already holds them. It keeps only items whose keyword score clears a
floor, so a word that half the items hold places nothing. The search leaves out function words such
as "to", so a message that shares only those with an item places nothing, as
[the store](./store.md#the-index) explains. The search also leaves out the user's name and the names
the deployment configuration gives the agent, because nearly every item names one of them, so a
message that says "Nix" would otherwise place any item that does. The store drops each query word
that the index stems the same as one of those names, whatever its case. The `memory.recall` tool
keeps names in its query, because there a name may be the point of the search. The number of items
and the score floor are configurable.

The turn places the items in a block before the first message, each with its short ID, version, who
saved it, source, date and how it came up. The recall appends its own record of each item and
version it delivered, and the turn-ended record lists the same references. Neither record holds the
text, so a later forget leaves no readable copy of what a turn saw. The block rides in the message
the guest sends and never in the user's message record, so a rebuilt session's history leaves
retrieved text out.

Retrieval on a resumed session also leaves out each item version that the session already holds, so
an item placed on one turn takes no slot on the next, and the next best match above the floor takes
its place. The conversation finds those versions by replaying the thread's records from the start of
the step that wrote its last compaction, rebuild or invalidation. A version counts as held when a
recall delivered it in a step whose turn ended, before the turn's last result. A step that errored
or stopped ran on a session that its retry starts again from the last boundary, and a recall after
the last result reached a part of the session that the next turn never resumes. The turn's record
keeps the newest recall it saw at that result for this reason. A compaction summarizes everything
delivered before it, its own step's earlier recalls included, so those items match again. A recall
later in the same step reaches the compacted session whole, so the compaction's record also keeps
the newest recall it saw, and only the recalls through that mark match again. A session rebuilt
after an invalidation holds what its step delivered. A turn that finds its session lost reads its
context again without the exclusion, and the new session counts only what that turn retrieved,
because the step's first recall served the lost session. An edit makes a new version, which the
session has not seen, so an edited item matches again. A recall that the model calls itself excludes
nothing.

The blocks before the first message keep one order: a new session's marker, a rebuilt session's
history, the pinned-core change note, the retrieved items,
[the writer's change note](./writer.md#the-change-note), then
[the events block](../core/conversation-turns.md#the-events-block). The user's own words come last,
so the model reads each block as context for them.

## Reading the log

The conversation's model reads its own thread of the [event log](../core/event-log.md) with the
`log.read` tool, so it can look back past what its session holds and propose memories from older
messages. A read returns one page of the user's messages, the replies and the tool results, oldest
first, each with its event ID, which is the record's sequence. The model narrows a read by a time
range or by words that every entry must hold, and pages on with the cursor the read returns. The
tool never returns the whole log at once: a read decrypts a bounded number of records, so a search
over a long thread can return a short page with a cursor to go on from. The tool reads only the
calling run's thread, and the read-only rule allows it because it declares only a read.

The log holds outside text, such as fetched pages and pastes, so every entry counts as outside
content to the decision point. The user's messages mark each span the user did not type, as the
writer's batches do. The call's record holds only the event IDs it returned, so a forget leaves no
readable copy of what the model read, and a forgotten message reads with no text and never matches a
search.

A memory write that quotes an older message passes that entry's event ID with its quote. The content
gate then checks the quote against that one record in place of the recent window, under the same
quote rules: the record must be a message the user sent in the calling thread, and the quote must
lie in text the user typed. A reply or a tool result never backs a write, because nobody typed it,
so a quote that only a fetched page holds becomes a proposal. The token check and the checker run as
for any other write ([the content gate](./writes.md#the-content-gate)).

## Forgetting and the live session

A forgotten item can sit in the conversation's session: in a retrieved block, in the pinned core of
an old system prompt, or in the model's own words. The store's forget therefore runs the session
cleanup, and completes only after the cleanup returns ([forgetting](./store.md#forgetting)). The
cleanup runs in order:

1. It aborts every turn in flight and waits for each one to end, so it never removes a transcript
   that a live CLI still writes.
2. It commits a session-invalidated record on the conversation's thread. From then on, no turn
   resumes a session that existed before the record, even one whose step commits later.
3. It starts the guest in the conversation's sandbox with a purge frame, and the guest removes the
   CLI's whole state directory, every transcript and fork included.
4. It commits a session-cleanup-completed record.

A turn and a cleanup never overlap: a turn that starts while a cleanup runs waits for it, and each
cleanup waits for the one before it. Turns never wait for each other, because a runner that took a
step over after its lease expired must not wait on the turn the stale runner still holds. Every step
is safe to run twice, so a crash mid-cleanup leaves the item forgetting, and the store's start runs
the cleanup again before any runner claims work. The aborted turn's step fails and runs again after
its retry delay, and that rerun finds the invalidated record and rebuilds the session.

A request already sent to the model provider keeps the text it received. The cleanup removes nixie's
copies and cannot recall that one.
