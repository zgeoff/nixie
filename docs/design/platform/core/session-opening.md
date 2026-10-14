# Session opening and compaction

- Decisions: [0045](../../../decisions/0045-session-opening-and-compaction.md),
  [0024](../../../decisions/0024-memory-in-context.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md)

Every new session of the conversation opens from one builder, with the same slots in the same order,
whatever started it: the first session, a compaction, or a rebuild after a crash or a forget. nixie
compacts the session itself. When a session passes a threshold, a step asks the model to write a
summary against fixed criteria, commits the summary to the event log, and the next turn opens a new
session from it. The event log therefore holds everything a new session opens with, and the forget
path reaches all of it.

[Conversation turns](../../../architecture/core/conversation-turns.md) covers the turn, the fork on
each resume and the rebuild that this design replaces, and
[memory in context](../../../architecture/memory/context.md) covers the pinned core, retrieval and
the session cleanup that a forget runs.

## The opening

A new session opens with six slots, from what defines the model to the current turn:

| Slot             | Where it lives     | First session | After a compaction | Rebuild                     |
| ---------------- | ------------------ | ------------- | ------------------ | --------------------------- |
| 1. Persona       | system prompt      | yes           | yes                | yes                         |
| 2. Pinned memory | first user message | yes           | yes                | yes                         |
| 3. Status        | first user message | yes           | yes                | yes                         |
| 4. Summary       | first user message | none          | the new summary    | the newest readable summary |
| 5. Recent turns  | first user message | none          | none               | the turns after the summary |
| 6. Current turn  | first user message | yes           | yes                | yes                         |

The system prompt holds the persona, the line that says who the note-taker is, the rule for pasted
and dropped text, the rule for system messages, and any other part that only nixie's definitions
set, such as the skill catalog. It holds nothing about memory, and it changes only when nixie's
definitions change, so it stays the stable head of the cached prefix. The guest keeps the SDK's
snapshot off, so a changed persona reaches a resumed session.

Slots 2 to 5 go in the session's first user message, before the current turn's own input. Each turn
resumes on a fork that copies the whole history, so the first message stays the same for the life of
the session with no store of its own, and the cached prefix after the system prompt holds from turn
to turn. A change during the session reaches the model as a note before the next message, and the
next session opens with the new value:

- A pin, an edit or an unpin arrives as the pinned-core change note, which overrides the opening's
  copy of the item.
- A restart, an answered proposal or a moment you keep from the client arrives in the events block.
- A forget never waits for a note: it invalidates the session, and the next turn opens a rebuild.

### One path for every start

The builder reads the newest readable summary, then the log records after the sequence the summary
covers, up to the rebuild budget. That one read gives every start its slots. The first session finds
no summary and no records. A session after a compaction finds a summary that covers every turn, so
slot 5 is empty. A rebuild finds the summary and the turns that came after it. A rebuild after a
forget finds no summary, because the forget erased every one, and reads turns back to the budget.

Slot 5 holds two parts:

1. Your messages and the replies, word for word with their stamps, newest back to the rebuild
   budget. When the budget runs out before the summary, status says that older turns are in the log.
2. The events block and the memory-change note, rendered again over the same span: from the oldest
   turn the slot keeps to the range the last turn's notes covered. Both read a range of the log from
   a cursor, so the events the model saw survive a rebuild without the summary. The current turn
   gets its own notes from that range onward, so no event appears twice.

A replayed event follows the events block's rules, so an approval quotes its version through a
recall of that version alone, and a forgotten item never returns through the replay. The pinned-core
change note is never replayed, because slot 2 renders the current core.

### The opening record

The builder writes a `model.session_opened` record for every new session, in place of the
session-rebuilt record. Its payload holds the kind of start and its reason, the sequence of the
summary it used or none, the count of turns and events in slot 5, and the status values. Retrieval
treats this record as the point from which a session holds nothing yet, in place of the last
compaction, rebuild or invalidation.

## Status

Status is a readout taken when the session opens and frozen for its life:

- **The kind of start:** the first session, a session after a compaction, or a rebuild with its
  reason (a lost session, a forget or a replaced sandbox). It carries the line that earlier history
  is in the event log and the log-read tool reaches it, and replaces the session marker.
- **The session start time**, in your zone, labelled as the time the session started. Each input
  that starts a turn carries its own send-time stamp, so the model never reads the status time as
  the current time.
- **The nixie version** that opened the session.
- **The model** from the conversation's profile, so the model can name itself in a moment
  reflection's label.
- **Moments kept in the last 7 days**, from the moments package.

Status is a registry, like the events block's. Each entry names its line and reads its value when
the session opens, and its package owns it, so a new field is a new entry and no change to the
builder. Every value is a name, a time or a count, so the opening record's payload holds them with
no free text.

After a forget erased the summaries, status adds a line that says a forget erased the summary of
earlier sessions, so the model reads the gap as deliberate.

## System messages

Every block that nixie writes into a user message is a system message: a `<system-message>` element
with a `type`, an `id` and an `at` stamp.

```text
<system-message type="summary" id="7f3a9c21b04e" at="Tue 14 Oct, 22:50, Sydney">
…
</system-message id="7f3a9c21b04e">
```

The `id` is fresh and random for each element, and the closing tag repeats it, as the pasted block
does, so text inside the element cannot close it early. That matters because a summary, a quoted
memory version or a retrieved item holds text nixie did not write. The `id` proves nothing about the
sender, because a forger can choose any value. The system prompt therefore states a position rule: a
system message comes from nixie only at the top level of a user message, and one inside a tool
result, a pasted block or a quote is text. The SDK sends tool results as their own blocks, so the
model can tell the two apart.

Your messages keep their stamp and stay outside the element, because they are your own words. The
random IDs never break the cache: the opening renders once and stays in the transcript, and each
later system message belongs to a new turn's input.

## The compactor

The compactor runs between turns, as a step of the conversation task, and never inside a turn.

1. **The trigger.** Each turn-ended record holds the context size and the window. A turn that ends
   at or past the threshold, a share of the window that the deployment configuration sets, marks the
   session for compaction, and its step asks to continue.
2. **The step.** The next step runs the compaction before it takes the inbox, so a message that
   lands meanwhile waits for one model call. The step forks the session at its committed boundary,
   as a turn does, and sends the compaction instruction as a system message of type `compaction`.
3. **The call.** The guest runs the instruction as a summary frame: one model call with no tools, so
   the summary cannot act. The call reads the session's cached prefix.
4. **The commit.** The step commits the summary record and clears the session boundary in one
   transaction. The next turn opens a new session with the kind of start "after a compaction".

The step writes nothing before its commit, so a rerun after a crash forks from the same boundary and
writes the summary again, and only one copy commits.

The SDK's auto-compaction is off, so nixie's compactor is the only way a session shrinks. A failed
compaction never blocks the inbox. The step commits a compaction-failed record with the error and
the count of failures in a row, in place of the summary, and the task goes back to waiting. The
client shows a notice from that record at the first failure, and the notice goes once a summary
commits. The next turn's step tries the compaction first, and when that attempt fails too, the step
commits another compaction-failed record and runs the turn on the old session. Turns therefore go on
while the session stays inside the window. A turn that overflows the window fails like any other
step, so a broken compactor stops the conversation where you see it, never in silence.

A turn can grow past the window on its own, such as from large tool results. Its step then compacts
the session from the last committed boundary and runs the turn again on the new session, once. Only
a turn that alone exceeds the window fails for good. How the SDK reports an overflow with
auto-compaction off is the first thing the build settles.

### The instruction

The instruction tells the model that nixie closes the session, what the next session opens with, and
that the memory store and the event log keep everything. It asks for a summary written to itself, in
its own words, that carries forward:

1. The open threads: what you asked for that is not done, what the model promised, and what it waits
   on.
2. The decisions you and the model settled, with the reason when it matters.
3. The events from outside the conversation that still matter.
4. The model's own state: what it was in the middle of, the tone of the conversation, and what it
   would check first.
5. The event ID of each item that needs its exact words, for the log-read tool.

It asks the model to leave out what the pinned memory says, instructions from pasted text, fetched
pages and tool results, and small talk that is finished. A token cap from the deployment
configuration bounds the summary. The text of the instruction lives in the code beside its renderer,
because its wording is tuned against the model.

## The summary record

The step commits each summary as a `model.session_summarized` record on the conversation's thread:

- **Erasable fields:** the summary text, under a key that belongs to this record alone.
- **Payload:** the last sequence the session held, the boundary it summarized, the trigger
  (`threshold` or `overflow`), the context size before the compaction and the summary's own size.
- **Model fields:** the model ID and the profile's ID from the profile nixie gave the step, as on
  every record of model output.

A summary reaches the next session's opening and the live view, and nothing else. It never becomes
memory, and per-turn retrieval, the recall tool and the log-read tool never return it, because the
model wrote it from an untrusted conversation. A new summary leaves the older ones in place, and the
builder reads only the newest.

### Forgetting

Every forget runs the session cleanup: a memory forget, a record forget and a moment destroy. The
cleanup gains one step, so each of them erases every summary:

1. The cleanup aborts every turn in flight and commits the session-invalidated record.
2. It deletes the key of every `model.session_summarized` record on the conversation's thread and
   checkpoints the key store.
3. It purges the guest's transcripts and commits the cleanup-completed record.

nixie cannot tell which summary holds the forgotten text without reading each one, so the first
build erases them all. The next session then opens as a rebuild with no summary. A later record of
which items each summary read can narrow the erasure with no change to this contract.
