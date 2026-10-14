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

[Conversation turns](../../../architecture/core/conversation-turns.md) covers the turn and the fork
on each resume, and [memory in context](../../../architecture/memory/context.md) covers the pinned
core, retrieval and the session cleanup that a forget runs.

## The opening

A new session opens from one builder with the same slots in the same order, and
[session opening](../../../architecture/core/session-opening.md) describes the builder, its status
registry and its opening record. A session after a compaction opens from that builder with the new
summary in its summary slot and no recent turns, because the summary covers every turn, and its
status reads the kind of start "after a compaction". The moments package adds a status entry for the
moments kept in the last 7 days.

## System messages

Every block that nixie writes into a user message is a system message, with the shape and the
position rule that
[system messages](../../../architecture/core/conversation-turns.md#system-messages) describes. The
opening's summary and the compaction instruction join them as system messages of type `summary` and
`compaction`.

Your messages keep their stamp and stay outside the element, because they are your own words. Each
stamp leads with the record's event ID, its log sequence, as in
`[#48213 · Tue 14 Oct, 22:55, Sydney · phone]`, on every input that starts or joins a turn and on
each line of slot 5. The model then holds the ID of every message it sees, so a summary, a memory
quote or a moment's span can cite one with no log read. A reply's own ID appears only on a rebuild,
because its record exists only after the model wrote it. The random IDs never break the cache: the
opening renders once and stays in the transcript, and each later system message belongs to a new
turn's input.

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
a turn that alone exceeds the window fails for good. The guest detects the overflow on the result's
terminal reason, `blocking_limit` when the CLI refuses the call and `prompt_too_long` when the model
API does, because no other failure gives either value
([overflow spike](../spikes/sdk-overflow/README.md)). The CLI refuses below the model's own window
and ignores the profile's context cap once auto-compaction is off, so the threshold sits under the
window the CLI assumes.

### The instruction

The instruction tells the model that nixie closes the session, what the next session opens with, and
that the memory store and the event log keep everything. It asks for a summary written to itself, in
its own words, that carries forward:

1. The open threads: what you asked for that is not done, what the model promised, what it waits on,
   and what is coming up for you.
2. The decisions you and the model settled, with the reason.
3. The events from outside the conversation that still matter.
4. The model's own state: what it was in the middle of, your mood, the tone of the conversation, and
   what it would check first.
5. The recurring jokes, nicknames and short phrases of yours that set the tone, word for word.

Its rules ask the model to quote a short phrase directly and give the event ID of a longer passage,
to mark what it is unsure of, such as whether something was a joke, and to state no fact about you
as settled, because the next session trusts the summary and a summary never becomes memory. When
pasted text, a fetched page or a tool result matters, the model describes it and never copies its
instructions. Finished work gets one line, and the summary leaves out what the pinned memory says
and small talk that is finished.

The model cannot count its own tokens, so the instruction gives a word target that nixie derives
from the token cap in the deployment configuration. nixie counts the reply with the same counter
that the rebuild budget uses. A summary over the cap gets one request, in the same fork, to cut it
to the cap, and a summary still over the cap commits with its size in the record, because a long
opening costs less than a failed compaction. The text of the instruction lives in the code beside
its renderer, because its wording is tuned against the model.

## The summary record

The step commits each summary as a `model.session_summarized` record on the conversation's thread:

- **Erasable fields:** the summary text as `text`, under a key that belongs to this record alone.
- **Payload:** the last sequence the session held as `throughSequence`, which the opening's builder
  reads, the boundary it summarized, the trigger (`threshold` or `overflow`), the context size
  before the compaction and the summary's own size.
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
