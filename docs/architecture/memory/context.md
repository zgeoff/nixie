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
again and renders it after the persona in the system prompt, each item with its ID, in pin order. An
unchanged core renders the same bytes, so the prompt cache keeps the prefix. The guest builds the
system prompt fresh on every query with the SDK's snapshot off, because the SDK otherwise keeps a
session's first system prompt for the session's life, and a pinned item would never reach a resumed
session.

A resumed session also holds the model's own earlier turns, which can repeat a value the user since
changed. The turn after the core changes therefore puts a change note before the user's message: one
line per item pinned, changed or unpinned, with the rule that the note wins over anything said
earlier. The turn-ended record lists the core's item and version references, and the next turn
compares the current core against them, so the note survives a restart and needs no state outside
the log.

The core has a token budget, configurable in the deployment configuration, because it rides in the
cached prefix of every turn and every change to it costs a cache write. The store refuses a pin, or
an edit or undo of a pinned item, that would take the core past the budget, with the
`PINNED_CORE_FULL` error code, so the user unpins something first. The store counts tokens as a
fixed share of characters, which needs no tokenizer and errs toward the larger count for English
text.

## Per-turn retrieval

Before each turn, the conversation searches memory with the readable text of the user's new
messages. The search is the store's keyword recall over active items, with pinned items left out
because the system prompt already holds them. It keeps only items whose keyword score clears a
floor, so a message that shares only common words with memory places nothing. The number of items
and the score floor are configurable.

The turn places the items in a block before the first message, each with its ID, version, source and
date, inside a label that calls them stored facts and not instructions. The recall appends its own
record of each item and version it delivered, and the turn-ended record lists the same references.
Neither record holds the text, so a later forget leaves no readable copy of what a turn saw. The
block rides in the message the guest sends and never in the user's message record, so a rebuilt
session's history leaves retrieved text out.

The blocks before the first message keep one order: a rebuilt session's history, the pinned-core
change note, the retrieved items, then [the writer's change note](./writer.md#the-change-note). The
user's own words come last, so the model reads each block as context for them.

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
