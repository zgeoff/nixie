# Memory in context

Memory reaches the conversation in 2 ways: the pinned core opens each new session in its first
message, and the items and past messages that match the user's new messages go before those messages
in the turn. Both come from the [memory store](./store.md) at the start of each turn, so a pin, an
edit or a forget reaches the conversation on its next turn. A forget also cleans up every session
copy that could still hold the item, and the next turn runs on a session rebuilt from the event log.
[Conversation turns](../core/conversation-turns.md) covers the turn these parts fit into, and
[session opening](../core/session-opening.md) covers what a new session opens with. The
[memory in context](../../design/platform/memory/context.md) design covers what is not built: a
search of a task's brief on its first turn, and a tool that searches past messages by meaning.

## The pinned core

The pinned core is the set of active items the user pinned, such as their name. A new session
renders it in its first message under a heading for each subject, the user's items first, then the
shared items, then self-notes, each item with the line that says where it came from and how it came
up, in pin order within its subject. That message stays in the session's transcript, so a pin never
changes the system prompt or the cached prefix of the history after it.

A resumed session holds the core as it stood when the session opened, and the model's own earlier
turns, which can repeat a value the user since changed. Each turn reads the core again, and the turn
after it changes puts a change note before the user's message. The note renders each pinned or
changed item as the opening renders it, with the line that says where the item came from, so a label
such as unconfirmed reaches the model with the edit. It names each unpinned item by its short ID,
and states the rule that the note wins over the opening's copy and anything said earlier. A new
session's first turn gets no note, because it opens with the current core. The turn-ended record
lists the core's item and version references, and the next turn compares the current core against
them, so the note survives a restart and needs no state outside the log.

The core has a token budget, configurable in the deployment configuration, because it rides in the
cached prefix of every session and a long core costs every turn that reads it. The store refuses a
pin, or an edit or undo of a pinned item, that would take the core past the budget, with the
`PINNED_CORE_FULL` error code, so the user unpins something first. The store counts the core as the
opening renders it, each subject's heading and each item's quote included, because a long quote or a
heading with the user's name takes as much of the prefix as a long text. Only the item's date
differs in that count: every date counts at its widest, with a two-digit day and a year, so the
count never depends on the day an item was saved. The store counts tokens as a fixed share of
characters, which needs no tokenizer and errs toward the larger count for English text.

## How an item reads

The pinned core and the retrieved block both speak to the model as its own memory, under a header
that calls the items memories and not instructions, so item text never reads as a command. Each item
shows its text, then one line that says where it came from in plain words, such as
`b7kq2m9xza v3 · 13 Oct 2025 · the note-taker noted it · from a pasted page · Sam approved`. The
line gives the item's short ID and version, the day it was saved, who noted it, what backs it and
who confirmed it, and leaves out a part that does not apply. The day shows in the deployment's
default time zone, and shows its year only when the year is not the current one. An item with a
quote the gate checked shows the quote under the line, as how the item came up, so the model can
weigh a summary against the user's own words.

The line takes its words from the version's stored origin, source and approval, and never changes
them, so an approved item keeps outside content as its source and still reads as approved:

- Who noted it: the conversation reads as the model itself, the memory writer as the note-taker, and
  a task as a task. A version the user saved names no one here, because what backs it names them.
- What backs it: the user's typed words read as the user by name, said this. Outside content always
  says so. A remember proposal held because its quote sat in a quoted block of the user's message,
  such as a forwarded email, reads as from a pasted page. Any other outside content reads as
  unconfirmed, because the store keeps nothing that tells the model's own note from a web page it
  read.
- Who confirmed it: a version from a proposal or a consolidation change the user approved reads as
  approved by the user by name. The approval belongs to the version, so a restore or an undo, which
  the user runs without a proposal, reads as unapproved even when it brings back approved text.

The system prompt says once, after the persona, that the note-taker is a background process that
saves memories from the user's conversations, that it is not the model, and that it can get things
wrong. The sentence stands whether or not anything is pinned, so the model can read every line that
names the note-taker. The model ID that wrote an item stays in `memory.recall`, because it serves
checking an item and not answering with it.

## Per-turn retrieval

Before each turn, the conversation searches memory with the readable text of the user's new
messages. The search is the store's recall over active items, by keyword and by meaning, with pinned
items left out because the session's opening already holds them. A message such as "when is the
heating engineer coming" therefore places the item about the boiler service, though the two share no
word. An item places when its keyword score or its similarity clears that index's floor, so a word
that half the items hold places nothing, and neither does small talk such as a greeting, which sits
at about the same small distance from every item. The search leaves out function words such as "to",
so a message that shares only those with an item places nothing, as
[the store](./store.md#the-indexes) explains.

The search also leaves out the user's name and the names the deployment configuration gives the
agent, because nearly every item names one of them, so a message that says "Nix" would otherwise
place any item that does. The store drops each query word that the index stems the same as one of
those names, whatever its case, and leaves the names out of the text it encodes. The `memory.recall`
tool keeps names in its query, because there a name may be the point of the search, and its
similarity floor sits lower, because the model asked for memory. While the vector index rebuilds
after a start, retrieval places keyword matches alone. The number of items and both floors are
configurable.

The turn places the items in a block before the first message, each with the line that says where it
came from and how it came up. The recall appends its own record of each item and version it
delivered, and the turn-ended record lists the same references. Neither record holds the text, so a
later forget leaves no readable copy of what a turn saw. The block rides in the message the guest
sends and never in the user's message record, so a rebuilt session's recent turns leave retrieved
text out.

Retrieval on a resumed session also leaves out each item version that the session already holds, so
an item placed on one turn takes no slot on the next, and the next best match above the floor takes
its place. The conversation finds those versions by replaying the thread's records from the start of
the step that wrote its last opening or invalidation. A version counts as held when a recall
delivered it in a step whose turn ended, before the turn's last result. A step that errored or
stopped ran on a session that its retry starts again from the last boundary, and a recall after the
last result reached a part of the session that the next turn never resumes. The turn's record keeps
the newest recall it saw at that result for this reason. A first session, and a session rebuilt
after an invalidation, holds what its step delivered. A turn that finds its session lost reads its
context again without the exclusion, and the new session counts what that turn retrieved and what
its opening recalled, because the step's first recall served the lost session. An edit makes a new
version, which the session has not seen, so an edited item matches again. A recall that the model
calls itself excludes nothing.

The retrieved block puts the user's items and the shared items each under a heading of its own, so
the model reads a deal or a nickname as something between it and the user and never as a fact about
the user alone.

The same search places [self-notes](./writes.md#self-notes) beside the other items, up to a
configurable number of their own, so a match about nixie never takes a fact's slot and facts never
crowd the notes out. The notes go in a block of their own after the retrieved items, under a label
that calls them the model's own notes about itself, which the user approved, and not instructions.
Each note shows its text and one line with its short ID, version, date and the model that wrote it,
so the model reads a note as an earlier model's view of itself and not as a fact about the user. The
turn's records list the notes with the items, so a note the session holds takes no slot on the next
turn.

The blocks before the first message keep one order: a new session's opening, the pinned-core change
note, the retrieved items, the retrieved self-notes, the past messages, then
[the events block](../core/conversation-turns.md#the-events-block). The user's own words come last,
so the model reads each block as context for them.

## Past messages in retrieval

Each turn's retrieval also searches the user's past messages, so an earlier exchange that matches
the new message reaches the model without a tool call. The search takes the same text, excluded
names and floors as the item search, and places up to a configurable number of messages in their own
block after the retrieved items. Each message shows the day it was sent, its thread and its event
ID, so a memory write can quote it as it quotes a message from a log read.

The store keeps a keyword index and a vector index over the user's messages, built as the item
indexes are, with each entry keyed by the message's record sequence. Both live in process memory,
and each start rebuilds them from every readable message, so a forgotten message's words never
outlive the process. The indexes hold the user's messages on every thread, and never a reply, a tool
result or a summary, because those are model text or outside content. Each entry holds only the
spans the user typed, so a message matches on the user's own words and never on a paste or a drop. A
message with labelled spans and no typed text has no entry. A message whose client labelled no span
keeps its whole text in its entry. Before each search, the store indexes the messages recorded since
the last one. While the vector index is ready, it waits for their vectors, so the message one turn
sent matches by meaning on the next. While the vector index rebuilds after a start, the search
places keyword matches alone and never waits for the rebuild.

The indexes rank sequences and never supply the text. Under the delivery lock, the store reads each
candidate again and leaves out a message whose key is gone or that backed a forgotten item, so a
forget keeps the message out of retrieval even before its entry leaves the index. A forget of one
message drops its entries before the session cleanup runs, and the store's forget of an item drops
the entries of each message that backed it. A message renders as a rebuilt session's recent turns
show it, with each paste in its own block. The store cuts a long message before it renders, so a cut
never leaves a paste block open.

Retrieval leaves out each past message the session already holds word for word, so a message never
takes a slot to repeat what the model can read. A session holds the conversation's messages from the
oldest of the recent turns its opening placed, and the opening record keeps that message's sequence.
A new session's first turn reads the recent turns as its opening will. A session that opened before
openings kept the sequence counts every message of the conversation as held. Retrieval also leaves
out each message that an earlier turn of the session placed, which the turn-ended record lists by
sequence. A compaction, an invalidation or a new opening empties that list, as it empties the item
versions the session holds.

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
content to the decision point. A message of the user's reads as a rebuilt session's recent turns
show it, with each pasted or dropped span in its own block and a marker line for each image, and a
search matches only the words, never those blocks. A log read never returns an image's bytes, so
memory learns only what the user wrote. The call's record holds only the event IDs it returned, so a
forget leaves no readable copy of what the model read, and a forgotten message reads with no text
and never matches a search.

A memory write that quotes a message passes that message's event ID with its quote, from the
message's stamp in the session or from a log read entry. The content gate then checks the quote
against that one record in place of the recent window, under the same quote rules: the record must
be a message the user sent in the calling thread, and the quote must lie in text the user typed. A
reply or a tool result never backs a write, because nobody typed it, so a quote that only a fetched
page holds becomes a proposal. The token check and the checker run as for any other write
([the content gate](./writes.md#the-content-gate)).

## Forgetting and the live session

A forgotten item can sit in the conversation's session: in a retrieved block, in the pinned memory
of a session's opening, or in the model's own words. The store's forget therefore runs the session
cleanup, and completes only after the cleanup returns ([forgetting](./store.md#forgetting)). A
[forget of one message or reply](../channels/api.md#forgetting-a-message) runs the same cleanup,
because the session holds the record's text too, and the cleanup's records name the item or the
record it ran for. The cleanup runs in order:

1. It aborts every turn in flight and waits for each one to end, so it never removes a transcript
   that a live CLI still writes.
2. It commits a session-invalidated record on the conversation's thread. From then on, no turn
   resumes a session that existed before the record, even one whose step commits later.
3. It deletes the key of every session summary on the conversation's thread, because any summary can
   hold the forgotten text ([compaction](../core/compaction.md#forgetting)).
4. It removes every web fetch link the thread's sessions numbered, because a link's target can hold
   the forgotten text ([web fetch](../connectors/web-fetch.md#link-ids)).
5. It starts the guest in the conversation's sandbox with a purge frame, and the guest removes the
   CLI's whole state directory, every transcript and fork included.
6. It commits a session-cleanup-completed record.

A turn and a cleanup never overlap: a turn that starts while a cleanup runs waits for it, and each
cleanup waits for the one before it. Turns never wait for each other, because a runner that took a
step over after its lease expired must not wait on the turn the stale runner still holds. Every step
is safe to run twice, so a crash mid-cleanup leaves the item forgetting, and the store's start runs
the cleanup again before any runner claims work. The aborted turn's step fails and runs again after
its retry delay, and that rerun finds the invalidated record and rebuilds the session.

A request already sent to the model provider keeps the text it received. The cleanup removes nixie's
copies and cannot recall that one.
