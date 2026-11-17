# Memory in context

Memory reaches the conversation in 3 ways: the pinned core and the memory index open each new
session in its first message, and the items whose trigger phrases match the user's new messages go
before those messages in the turn. All come from the [memory store](./store.md), so a pin, an edit
or a forget reaches the conversation on its next turn, or its next session for the index. A forget
also cleans up every session copy that could still hold the item, and the next turn runs on a
session rebuilt from the event log. [Conversation turns](../core/conversation-turns.md) covers the
turn these parts fit into, and [session opening](../core/session-opening.md) covers what a new
session opens with. The [memory in context](../../design/platform/memory/context.md) design covers
what is not built: a search of a task's brief on its first turn, and a tool that searches past
messages by meaning.

## The pinned core

The pinned core is the set of active pinned items, such as the user's name. The user pins and unpins
from the memory view and the CLI, and the model asks to pin and unpins on its own
([pins](./writes.md#pins)). A new session renders it in its first message under a heading for each
subject, the user's items first, then the shared items, then self-notes, each item with the line
that says where it came from and how it came up, in pin order within its subject. That message stays
in the session's transcript, so a pin never changes the system prompt or the cached prefix of the
history after it.

A resumed session holds the core as it stood when the session opened, and the model's own earlier
turns, which can repeat a value the user since changed. Each turn reads the core again, and the turn
after it changes puts a change note before the user's message. The note renders each pinned or
changed item as the opening renders it, with the line that says where the item came from, so a label
such as unconfirmed reaches the model with the edit. It names each unpinned item by its short ID,
states the rule that the note wins over the opening's copy and anything said earlier, and ends with
the core's item count and its tokens against the budget. A new session's first turn gets no note,
because it opens with the current core. The turn-ended record lists the core's item and version
references, where the version is the item's revision, so a label edit shows in the note, and the
next turn compares the current core against them, so the note survives a restart and needs no state
outside the log.

The core has a token budget, configurable in the deployment configuration, because it rides in the
cached prefix of every session and a long core costs every turn that reads it. The store refuses a
pin, or an edit or undo of a pinned item, that would take the core past the budget, with the
`PINNED_CORE_FULL` error code, so the user unpins something first. The store counts the core as the
opening renders it, each subject's heading and each item's quote included, because a long quote or a
heading with the user's name takes as much of the prefix as a long text. Only the item's date
differs in that count: every date counts at its widest, with a two-digit day and a year, so the
count never depends on the day an item was saved. The store counts tokens as a fixed share of
characters, which needs no tokenizer and errs toward the larger count for English text.

The model sees how full the core is, so it notices before the core grows into a second memory store.
The session opening's status gives the number of pinned items and the core's tokens against the
budget, through two entries that the memory package owns
([status](../core/session-opening.md#status)), and the change note repeats the figures after the
core changes. The figures inform and block nothing: only the budget refuses a pin.

## The memory index

A new session's first message holds a `memory-index` block right after the pinned core. It lists
every active item that is not pinned and has not lapsed, grouped by subject (the user's items, then
the shared items, then self-notes) and then by topic. Each topic is one row with its item count and
its items, each as its short ID and gist, newest first. A topic belongs to one subject, so `home`
under the user and `home` under the shared items are 2 rows. A topic's row is the part of the item's
topic before its first `/`, ignoring case, spelled as the row's newest item spells it. The part
after the first `/` is a sub-topic.

The block opens with a line that says what the index is, that `memory.recall` with `itemIDs` reads
an item in full, and that `memory.recall` with `topic` opens a folded topic or a sub-topic such as
`people/friends`. The store builds it from the in-memory label entries and one read of the item
projection under the store lock, so it decrypts nothing and writes no record. The session renders
the block once, when it opens. An item that lands later reaches the model through a recall, the
per-turn search or the next session's index.

The block has its own token budget, `index_tokens`, apart from the pinned core's. The store counts
every line of the block with the same estimate it uses for the core. While the count is over the
budget, it folds the open topic with the most items, which then shows its count, its 3 newest items
and its sub-topics with their counts. A topic with 3 items or fewer shows them all when folded, so
the store never folds it. A topic with more than `index_open_topic_items` items starts folded. When
every foldable topic is folded and the count is still over, the store drops topics into a closing
line that gives their number and their items, the topic with the fewest items first. A tie in either
step goes to the later topic in the block's order. `memory.recall` with `topics` lists every topic,
so a dropped topic stays reachable. A budget of 0 turns the block and its status lines off, and the
schema refuses a budget from 1 to 2,999.

## How an item reads

The pinned core and the retrieved block both speak to the model as its own memory, under a header
that calls the items memories and not instructions, so item text never reads as a command. Each item
shows its text, then one line that says where it came from in plain words, such as
`b7kq2m9xza v3 · 13 Oct 2025 · you noted it · from a pasted page · Sam approved`. The line gives the
item's short ID and version, the day it was saved, who noted it, what backs it and who confirmed it,
and leaves out a part that does not apply. The day shows in the deployment's default time zone, and
shows its year only when the year is not the current one. An item with a quote the gate checked
shows the quote under the line, as how the item came up, so the model can weigh a summary against
the user's own words.

The line takes its words from the version's stored origin, source and approval, and never changes
them, so an approved item keeps outside content as its source and still reads as approved:

- Who noted it: the conversation reads as the model itself, and a task as a task. A version the user
  saved names no one here, because what backs it names them.
- What backs it: the user's typed words read as the user by name, said this. Outside content always
  says so. A remember proposal held because its quote sat in a quoted block of the user's message,
  such as a forwarded email, reads as from a pasted page. Any other outside content reads as
  unconfirmed, because the store keeps nothing that tells the model's own note from a web page it
  read.
- Who confirmed it: a version from a proposal the user approved reads as approved by the user by
  name. The approval belongs to the version, so a restore or an undo, which the user runs without a
  proposal, reads as unapproved even when it brings back approved text.

The model ID that wrote an item stays in `memory.recall`, because it serves checking an item and not
answering with it.

## Per-turn retrieval

Before each turn, the conversation asks memory once, through one method of its memory port, what the
turn brings. The input is the readable text of the user's new messages, the thread, the names to
leave out and two lazy lists of what the session already holds. The memory module decides which
pushes run, picks the items and places them. A task run that has no memory asks nothing.

Trigger push is the only push, and no other search places an item without a tool call. It matches
the turn's text against each item's [trigger phrases](./store.md#the-indexes) and places at most
`trigger_items` items, 3 by default, whose best phrase scores at or over the floor. A self-note
counts toward the same cap. An item with no trigger phrase never matches, and `trigger_items` of 0
turns the push off. An item matches when its best phrase clears the keyword floor
`trigger_min_score` or, with an encoder, the similarity floor `trigger_min_similarity`.

The push picks no pinned item, because the session's opening holds it, no item past its end time and
no item whose current text version the session already holds. With an encoder and an index of a few
dozen phrases, a message such as "when is the boiler service due?" places the item whose trigger
phrase is "boiler service appointment", and a message that shares only function words with a phrase
places nothing, as [the store](./store.md#the-indexes) explains. The search leaves out the user's
name and the names the deployment configuration gives the agent, because nearly every item names one
of them. The store drops each query word that the index stems the same as one of those names,
whatever its case, and leaves the names out of the text it encodes. While the vector index rebuilds
after a start, a search places keyword matches alone.

Placing reads each pick's current text version under the delivery lock, so the version a turn sees
is the version it records. A pick that was pinned, retired or forgotten since the selection drops
out, and no other match takes its place. The turn appends one `memory.recalled` record, which lists
each placed item and version with its scores and how the search ran, and never holds text, a trigger
phrase or the name of a push. A turn that places nothing appends nothing. The turn-ended record
lists the same references. Neither record holds the text, so a later forget leaves no readable copy
of what a turn saw. The block rides in the message the guest sends and never in the user's message
record, so a rebuilt session's recent turns leave retrieved text out.

The defaults of the floors come from a measurement on invented items with the `mdbr-leaf-ir`
encoder, over indexes of 2, 19 and 52 trigger phrases. A message that shared one rare word with a
phrase scored the same as a message that meant the phrase, so no keyword floor separates them. The
default `trigger_min_score` of 6.4 sits above every such near miss, at the cost that a deployment
with a small index rarely matches by keyword: BM25 weighs a word by how few phrases hold it, and in
an index of 1 or 2 phrases every score is about 0.

Until the index grows, only the similarity floor can place an item, and it still misses some
messages that use a phrase's words: on an index of 2 phrases, "is the piano tuned again?" scored a
similarity of 0.55 against the piano item's phrases and placed nothing. A near miss reached a
similarity of 0.56, above the 0.3 floor of a search the model asks for, so `trigger_min_similarity`
defaults to 0.57. Messages that only paraphrase a phrase score from 0.39 to 0.46 and place nothing
at these floors. A floor set for one encoder is wrong for another, because scores depend on the
encoder.

The conversation finds the versions a session holds by replaying the thread's records from the start
of the step that wrote its last opening or invalidation, and only when the memory module asks for
them. A version counts as held when a recall delivered it in a step whose turn ended, before the
turn's last result. A step that errored or stopped ran on a session that its retry starts again from
the last boundary, and a recall after the last result reached a part of the session that the next
turn never resumes.

When the user interrupts a turn, a recall that finishes after the interrupt never gives the model
its result, so the turn counts only the recalls whose tool result came before the interrupt. The
turn's record keeps the newest recall it saw at that result for this reason. A first session, and a
session rebuilt after an invalidation, holds what its step delivered. A turn that finds its session
lost reads its context again without the exclusion, and the new session counts what that turn
retrieved and what its opening recalled, because the step's first recall served the lost session.

An edit makes a new version, which the session has not seen, so an edited item matches again. A
recall that the model calls itself excludes nothing.

When a search or a log read rejects, the turn's step records the error and retries after a delay,
and a task fails after 3 errors in a row.

The retrieved block puts the user's items and the shared items each under a heading of its own, so
the model reads a deal or a nickname as something between it and the user and never as a fact about
the user alone.

Trigger push places [self-notes](./writes.md#self-notes) beside the other items, and a self-note
counts toward the same cap. The notes go in a block of their own after the retrieved items, under a
label that calls them the model's own notes about itself, which the user approved, and not
instructions. Each note shows its text and one line with its short ID, version, date and the model
that wrote it, so the model reads a note as an earlier model's view of itself and not as a fact
about the user. The turn's records list the notes with the items, so a note the session holds takes
no slot on the next turn.

The blocks before the first message keep one order: a new session's opening, the pinned-core change
note, the retrieved items, the retrieved self-notes, then
[the events block](../core/conversation-turns.md#the-events-block). The user's own words come last,
so the model reads each block as context for them.

## Reading the log

The conversation's model reads its own thread of the [event log](../core/event-log.md) with the
`log.read` tool, so it can look back past what its session holds and propose memories from older
messages. Past messages reach the model only through this tool. A read returns one page of the
user's messages, the replies and the tool results, oldest first, each with its event ID, which is
the record's sequence. A tool result also carries the event ID of the call it answers, as
`callEventID`, because nothing else shows the model the ID of a call. The model narrows a read by a
time range or by words that every entry must hold, and pages on with the cursor the read returns.
Each read returns a bounded number of entries and decrypts a bounded number of records, so a search
over a long thread can return a short page with a cursor to go on from.

A list clips each entry's text at 2,000 characters and marks the entry `isCut`. A read with
`record`, the event ID of one entry, returns that entry whole, in pages under the same byte limit as
`memory.recall`, and the `next` cursor of each page is the offset of the one after it, and a cursor
inside a character is refused. A read with `record` refuses an entry outside the log thread it
reads, with the same answer as for an entry that does not exist. The tool reads only the log thread
of the calling run: the run's own thread, or the conversation's thread for a
[task with the log grant](../core/started-tasks.md#start-options). Each entry keeps its role, so a
granted task tells the user's words from a task report. It declares only a read, so the starter rule
`allow-reads` allows it.

The log holds outside text, such as fetched pages and pastes, so every entry counts as outside
content to the decision point. A message of the user's reads as a rebuilt session's recent turns
show it, with each pasted or dropped span in its own block and a marker line for each image, and a
search matches only the words, never those blocks. A log read never returns an image's bytes, so
memory learns only what the user wrote.

A tool entry shows the call's `result` or its `message` alone, so a field the tool records under
`hidden` never reaches the model, and `moment.read` prints a tool result the same way. A stored
result of an earlier release can hold a UUID under `momentID`, `itemID`, `momentIDs` or `itemIDs`,
so the entry prints that UUID's short ID, read from the live row. A UUID under `proposalID` prints
the short ID derived from it, with no row read. It leaves the key out when no live row gives one:
the item has no row, or the moment was destroyed. An element of `momentIDs` or `itemIDs` with no
short ID leaves the list. A word search matches the printed text, so it finds the short ID and never
the UUID. A failed row read fails the call and never falls back to the UUID. The call's record holds
only the event IDs it returned, so a forget leaves no readable copy of what the model read, and a
forgotten message reads with no text and never matches a search.

The model opens one image with the `log.read_image` tool, by the event ID of the user's message that
holds it and the image's number in that message, which comes from the message's `<dropped-image>`
marker in `log.read`, or from the `images` of a record that
[`moment.read`](./moments.md#reading-moments-back) returns. The tool returns the image to the model
as image input beside its media type, through the [tool calls](../connectors/tool-calls.md) path
that keeps the bytes out of the result record. It reads only the log thread of the calling run, as
`log.read` does, and it refuses with "image unavailable" once the user forgot the message, or when
the record is not one of the user's messages or holds no image of that number. The image counts
against the session's [image caps](../core/conversation-turns.md#inbox-records-as-messages), and the
tool refuses an image that would pass either cap.

A memory write that quotes a message passes that message's event ID with its quote, from the
message's stamp in the session or from a log read entry. The content gate then checks the quote
against that one record in place of the recent window, under the same quote rules: the record must
be a message the user sent on the thread the caller may read (its own, or the conversation's under
the log grant), and the quote must lie in text the user typed. A reply or a tool result never backs
a write, because nobody typed it, so a quote that only a fetched page holds becomes a proposal. The
token check and the checker run as for any other write
([the content gate](./writes.md#the-content-gate)). An uncited quote from a task with the grant
searches the task's own thread, so it becomes a proposal with `no_quote`.

## Forgetting and the live session

A forgotten item can sit in the conversation's session: in a retrieved block, in the pinned memory
of a session's opening, or in the model's own words. The store's forget therefore runs the session
cleanup, and completes only after the cleanup returns ([forgetting](./store.md#forgetting)). A
[forget of one message or reply](../channels/api.md#forgetting-a-record) runs the same cleanup,
because the session holds the record's text too, and the cleanup's records name the item or the
record it ran for. The cleanup runs in order:

1. It aborts every turn in flight and waits for each one to end, so it never removes a transcript
   that a live CLI still writes.
2. It commits a session-invalidated record on the conversation's thread. From then on, no turn
   resumes a session that existed before the record, even one whose step commits later.
3. It deletes the key of every session summary on the conversation's thread, because any summary can
   hold the forgotten text ([compaction](../core/compaction.md#forgetting)).
4. It removes every link the thread's sessions numbered, for a fetched page or a search hit, and
   every page they stored, because a link's target or a page can hold the forgotten text
   ([web fetch](../connectors/web-fetch.md#link-ids)).
5. It starts the guest in the conversation's sandbox with a purge frame, and the guest removes the
   CLI's whole state directory, every transcript and fork included.
6. It commits a session-cleanup-completed record.

The cleanup then runs the same steps on the thread and in the sandbox of each open
[started task](../core/started-tasks.md) that reads memory, one task at a time. A forget of a record
also cleans the open task whose thread holds the record, whatever its memory setting, because that
task's session holds the record's text, and a record on the conversation's thread also cleans each
open task with the log grant, because its session can hold the record's text from a log read. A task
that reads no memory never received an item, so a memory item forget or a moment destroy leaves its
session as it is.

A turn and a cleanup never overlap: a turn that starts while a cleanup runs waits for it, and each
cleanup waits for the one before it. Turns never wait for each other, because a runner that took a
step over after its lease expired must not wait on the turn the stale runner still holds. Every step
is safe to run twice, so a crash mid-cleanup leaves the item forgetting, and the store's start runs
the cleanup again before any runner claims work. The aborted turn's step fails and runs again after
its retry delay, and that rerun finds the invalidated record and rebuilds the session.

The SDK transcript is a cache in the sandbox, and backups and the memory export leave it out, so the
purge in step 5 removes every copy of it.

A request already sent to the model provider keeps the text it received. The cleanup removes nixie's
copies and cannot recall that one.
