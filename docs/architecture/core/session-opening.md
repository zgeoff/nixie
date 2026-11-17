# Session opening

Every new session of the conversation opens from one builder, with the same slots in the same order,
whatever started it: the first session, a compaction, or a rebuild after the guest lost the session,
a forget or a persona change invalidated it, or its images left no room for the next message's. The
system prompt holds only what nixie's definitions set, and everything that changes with the user's
data goes in the session's first user message. That message stays in the session's transcript for
the session's life, so the cached prefix holds from turn to turn, and a change during the session
reaches the model as a note before the next message. [Conversation turns](./conversation-turns.md)
covers the turn, the fork on each resume and when a turn opens a new session,
[memory in context](../memory/context.md) covers the pinned core and retrieval, and
[compaction](./compaction.md) covers the step that writes the summary a session opens with.

## The slots

A new session opens with seven slots, from what defines the model to the current turn:

1. **Persona.** The system prompt holds the persona, the catalog of the conversation's
   [skills](./skills.md#the-catalog), the rule for pasted and dropped text and images, and the rule
   for system messages. It holds nothing about memory, so it changes only when nixie's definitions
   change, when the conversation's [skill pin](./skills.md#the-pin) moves, or when a restart changes
   the [catalog's cap](./skills.md#the-catalog). Between those changes it stays the stable head of
   the cached prefix.
2. **Status.** A readout taken when the session opens.
3. **Pinned memory.** The pinned core as it stands when the session opens, each item with the line
   that says where it came from, or a line that says nothing is pinned.
4. **Memory index.** Every active item that is not pinned, one row per topic, with the gist of each
   item. [The index](../memory/context.md#the-memory-index) covers its layout and budget. The slot
   is empty, and the block left out, when no such item exists or the budget is 0.
5. **Summary.** The newest summary that is still readable.
6. **Recent turns.** The user's messages and the replies after that summary, with the events over
   the same span of the log, memory changes included.
7. **The current turn.** The retrieved items, the turn's own notes and the user's messages.

Slots 2 to 6 render as system messages, of types `status`, `pinned-memory`, `memory-index`,
`summary` and `recent-turns`, before the current turn's blocks in the session's first user message.
Each turn resumes on a fork that copies the whole history, so the first message needs no store of
its own. A pin therefore leaves the system prompt and the cached prefix of the whole history as they
were. A pin, an edit or an unpin during the session arrives as the pinned-core change note, which
overrides the opening's copy of the item, and the next session opens with the new core.

The CLI's own compaction would summarize the first message away with the rest of the history, so the
guest turns every CLI compaction off. A session therefore keeps its opening until nixie's compactor
closes it, and the session after it opens with the whole pinned core again.

## One path for every start

The builder reads the newest summary that is still readable, then the thread's messages and replies
after the sequence that summary covers, newest back to the rebuild budget. That one read gives every
start its slots. The first session finds no summary and no turns, so it opens with the status, the
pinned memory and the memory index alone. A rebuild after a lost or a full session, or after a
persona change, finds the turns after the newest summary. A forget erases every summary, so a
rebuild after a forget finds none and reads turns back to the budget. A session that opens after a
compaction finds a summary that covers every turn, so its slot 6 is empty.

The summary record keeps its text in erasable fields and the last sequence it covers in its payload.
The builder passes over a summary whose key is gone to the next one that is still readable, so a
forgotten summary never reaches the model. A summary never becomes memory, and only the opening
reads it.

The recent turns stop at the newest `log_reset` record on the thread, so a session after a
[reset of the conversation](./event-log.md#resetting-the-conversation) reads no line of the old
conversation. They leave out every message from the turn's first inbox record on, so a pending
message reaches the model once, as a live message. They keep every committed reply, because a turn
that left messages for the next step commits its reply after them. They hold the messages from other
tasks beside the user's, each in a `<task-message>` element with its ID, so a rebuilt session can
still name the message it answers. They hold the messages that the session's task sent to other
tasks too. Those messages are on the receivers' threads, so the builder reads them by sender and
merges them in by sequence, and a rebuilt session still knows what its task sent.

## The note over the recent turns

The events block reads a range of the log from a cursor, so a rebuild renders it again over the span
of the recent turns: from where the note of the oldest kept turn started, through where the last
turn's note ended. The span starts at that note, not at the turn's first record, because the note
covers what happened before the turn's message. The current turn's own note starts where the span
ends, so an event the model saw before the rebuild appears once, in slot 6, and an event that
happened since appears once, in the current turn's note. A replayed note says that it covers the
recent turns, not the time since the last turn.

A replayed event follows the events block's rules, so an approval quotes its version through a
recall of that version alone, and an item a forget began never returns through the replay. The
pinned-core change note is never replayed, because slot 3 renders the current core. A session with
no recent turn replays nothing.

## Status

Status is a registry, like the events block's. Each entry names its line and reads its value when
the session opens, and the package that owns the value owns the entry, so a new line is a new entry
and no change to the builder. The server builds the registry when the conversation starts, in the
order the status shows:

| Entry               | Owner                   | What it reads                                                          |
| ------------------- | ----------------------- | ---------------------------------------------------------------------- |
| The kind of start   | the sessions package    | the first session, a compaction, or a rebuild and its reason           |
| The start time      | the sessions package    | when the session opened, in the zone of the newest message             |
| The nixie version   | the server              | the release that opened the session                                    |
| The model           | the sessions package    | the model of the conversation's profile, so it can name itself         |
| The pinned items    | the memory package      | how many items the pinned core holds                                   |
| The pinned tokens   | the memory package      | the pinned core's tokens against its budget                            |
| The week's moments  | the memory package      | the [moments](../memory/moments.md) kept over the past week, by keeper |
| The active mandates | the definitions package | each mandate in force, its title, rule sentences and end               |
| The index items     | the sessions package    | how many active items that are not pinned the index covers             |
| The index tokens    | the sessions package    | the index block's tokens against its budget                            |

The kind of start says that earlier history is in the event log. After a forget, it says that the
forget erased the summary of earlier sessions, so the model reads the gap as deliberate. The start
time is labelled as the time the session started, because each input that starts a turn carries its
own stamp, and the model must never read the status time as the time now. The two index lines come
last, and only when the index budget is above 0. They come from the same read of the memory as the
index block, so they match it. Every value is a name, a time or a count, so the opening record holds
them with no free text. The active mandates line records the count of mandates, and its text lists
them.

## The brief

A task reads its brief once per session, before any other message of its thread. Where it reads it
depends on the brief's origin:

- A started task's brief is a `task_message` record. The first turn takes it as the first message of
  its batch. A rebuilt session holds it in its recent turns when they reach back that far, and
  otherwise pins it in the opening as a `<task-message>` envelope, placed after the memory blocks
  and before the summary.
- A definition's task run has a brief with no record. It is built from the open task run: the
  `brief` of the version the task run pins, the task run's brief ID as its message ID, and the time
  the task run opened as its time. It renders in an envelope from the label
  `task definition: {name}`, as a request with no `reply-to`. The text sits only in the store of
  definition versions, so a forget has no key to destroy. A definition's task with no open task run
  has no brief, and nixie never shows the brief of an ended task run. While a definition is out of
  force and its task has an open task run, the task shows the version that task run pins.
- A task that the release before started holds its brief in its creation record. It renders last in
  the preamble of the first session, and pinned in every rebuilt one.

A definition's brief renders by the first row that applies:

| The case                                                                           | Where the brief renders |
| ---------------------------------------------------------------------------------- | ----------------------- |
| the first turn of a carried task run, in a session that it resumes                 | not rendered            |
| a session that opens as a rebuild or after a compaction                            | pinned in the opening   |
| the first turn of a task run, in a new first session or at the step that opened it | last in the preamble    |
| any later turn of a resumed session                                                | not rendered            |

One function decides the row once per turn, and the preamble and the opening both follow its answer,
so the model reads the brief at most once. A rerun of a task run's first step renders the same brief
ID, because the ID belongs to the task run. A carried task run copies the ID of the task run it
carries.

A rebuilt or compacted session also pins the open task run's run blocks, in the order trigger,
report shape, since, right after the memory blocks and before the brief, so a summary of the turns
cannot drop the times that the task run's log reads need. That turn's preamble then holds no run
blocks. A first session and a resumed turn keep the run blocks in the preamble, which comes before
the brief that has no record.

## The opening record

The step writes one session-opened record for every new session, in the same commit as the turn. Its
payload holds the kind of start and its reason, the session it replaced when the step knew one, the
sequence of the summary it used, the count of records and events in slot 6, each status value under
its entry's name, the hashes of the persona and the policy in force when the session opened, and the
sequence of the brief the opening accounted for, or null when the task has none. A started task
whose newest opening has no such field opened before briefs were messages, so its next step rebuilds
the session once.

Retrieval counts what a session holds from this record, as
[per-turn retrieval](../memory/context.md#per-turn-retrieval) explains. The record commits after
every recall of its step. When the guest lost the session, the step's first recall served the lost
session, so the opening keeps the sequence of the newest recall before it began. Retrieval drops the
recalls through that mark and keeps the ones the replay made after it, and the turn-ended record
lists what the turn retrieved. Every other opening keeps all of its step's recalls, because they
reached the new session. A rebuild record that a log holds from before opening records counts as the
opening of a lost session.
