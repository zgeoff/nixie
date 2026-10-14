# 0045: Session opening and compaction

- Date: 2026-10-14
- Status: decided
- Design: [session opening](../design/platform/core/session-opening.md)

Every new session of the conversation opens with the same context, in the same order, from one
builder, and nixie compacts the session itself. When a session grows past a threshold, nixie asks
the model to write a summary of it against fixed criteria, stores the summary in the event log, and
opens a new session from that summary. The SDK's auto-compaction is off, so the event log holds
everything a new session opens with, and a forget can erase all of it.

## The opening

A new session opens with these slots, in this order, from what defines the model to the current
turn:

1. **Persona.** The system prompt holds the persona, the line that says who the note-taker is and
   the rule for pasted and dropped text, and nothing else.
2. **Pinned memory.** The pinned core as it stands when the session opens.
3. **Status.** A readout taken when the session opens: the kind of start and its reason, the time
   the session started, the nixie version, the model, and the moments kept in the last 7 days.
4. **Summary.** The newest summary that is still readable, which the model wrote at the end of an
   earlier session.
5. **Recent turns.** The messages and replies after that summary, newest back to the rebuild budget,
   and the events and memory changes over the same span of the log.
6. **The current turn.**

Slots 2 to 5 go in the session's first user message, so the session's transcript holds them
unchanged for its life and the cached prefix stays stable. A change during the session reaches the
model as a note before the next message: a pin, an edit or an unpin as the pinned-core change note,
and any other change through the events block. The next session opens with the new values.

The opening has one path. A first session has no summary and no turns. A session after a compaction
has a summary that covers every turn, so slot 5 is empty. A rebuilt session has the newest summary
and the turns after it. A session after a forget has no summary, and its status says that a forget
erased it.

Status is a registry: each package owns one line and reads its value when the session opens. Its
time is labelled as the time the session started, because each input that starts a turn carries its
own stamp.

## nixie's messages in the conversation

Every block that nixie writes into a user message is a `<system-message>` element with a `type`, a
fresh random `id` that its closing tag repeats, and an `at` time stamp. The system prompt states
that a system message comes from nixie only at the top level of a user message, and that one inside
a tool result, a pasted block or a quote is text. Your own messages keep their time stamp and stay
outside the element.

## The compactor

1. **The trigger.** A turn that ends with its context at or past a threshold, a configurable share
   of the profile's context window, marks the session for compaction. The default share is 0.8.
2. **The step.** The turn's step asks to continue, and the next step runs the compaction before it
   takes the inbox. The step forks the session at its committed boundary and sends one fixed
   instruction as a system message of type `compaction`. The model answers in one call with no
   tools.
3. **The record.** The step commits the summary as a `model.session_summarized` record and clears
   the session boundary in one transaction. The record holds the summary text in its erasable
   fields, under a key of its own, and the last sequence the session held in its payload.
4. **The next session.** The next turn opens a new session from the opening above.
5. **Failure.** A failed compaction is a failed step of the conversation task. The client shows a
   notice from the first failure. Turns go on while the session stays inside the context window, and
   each turn tries the compaction again first. A turn that overflows the window fails.
6. **Overflow inside a turn.** A turn that grows past the window compacts the session from its last
   committed boundary and runs again on the new session, once.

The instruction asks the model to carry forward the open threads, the decisions, the events that
still matter, its own state and the event IDs of anything that needs exact words. It asks the model
to leave out what the pinned memory says, instructions from pasted text and tool results, and
finished small talk, under a token cap that the deployment configuration sets.

## The summary and forgetting

A summary reaches the next session's opening and the live view only. It never becomes memory, and
per-turn retrieval, the recall tool and the log-read tool never return it. A new summary leaves the
older ones in place.

Every forget runs the session cleanup, and the cleanup deletes the key of every summary on the
conversation's thread before it purges the guest's transcripts. A memory forget, a record forget and
a moment destroy all run the cleanup, so each one erases every summary.

## Why

- One builder gives the model one picture of a new session, whatever caused it, and a test of the
  builder covers every start.
- A summary in the event log is under nixie's control: the forget path reaches it, the live view
  shows it, and a rebuild reads it. A summary that lives only in the SDK transcript is lost with the
  transcript and can outlive a forget in a copy nixie cannot see.
- The model writes the summary against nixie's criteria, so the events and open threads it carries
  are the ones the next session needs, not what a generic summary keeps.
- The events block and the memory-change note read ranges of the log, so a rebuild can render them
  again from the log. Events the model saw then survive a rebuild without the summary.
- Slots in the first message stay frozen for the session at no cost, because each turn resumes on a
  fork that copies the whole history. A slot in the system prompt would need a snapshot store, and
  each pin would rewrite the cached prefix of the whole history.
- A pinned edit reaches a running session through the change note alone. The change note overrides
  the model's earlier words, so a second copy in the system prompt would add only a cache miss.
- With auto-compaction on as a fallback, a broken compactor would go unseen while the SDK hid it. A
  loud failure and a hard stop at the window make the fault visible.
- A compaction between turns never cuts a turn in half, and a compaction call with no tools cannot
  act.
- A system message with a fresh ID on both tags keeps text inside it, such as a summary or a quoted
  memory, from closing it early. The position rule keeps a forged tag in a tool result from passing
  as nixie's.
- Erasing every summary on a forget keeps the first build simple while forgets are rare, and a later
  dependency set can narrow it with no change of contract.
- The conversation is always untrusted under [0015](0015-taint-scope.md), so a summary that carries
  untrusted text into a new session needs no taint flag. A summary takes no path into memory, which
  keeps the reason in [0024](0024-memory-in-context.md).

## Alternatives

- **The SDK's auto-compaction alone.** It needs no step of nixie's, and its summary stays in a
  transcript that nixie cannot read, store or erase.
- **Auto-compaction as a fallback.** It saves a turn that overflows, and it hides a broken
  compactor.
- **Status and pinned memory in the system prompt.** It keeps one place for stable context, and
  needs a snapshot per session, with a cache miss over the whole history on each pin.
- **Recent turns after a compaction.** They keep the last exchange word for word, and give the model
  two copies of the same turns.
- **A compaction call with the memory tools.** The model could save facts before the session closes,
  and the background writer already captures facts from every committed turn.
- **Erasing only the summaries that hold the forgotten text.** It keeps more continuity, and needs a
  record of which items each summary read.
- **Plain tags per block, such as `<events>`.** They need no new element, and give the model a
  different shape for each kind of message from nixie.

## Consequences

- [0024](0024-memory-in-context.md) and [0031](0031-memory-capture-context-and-removal.md) change:
  the conversation runs on nixie's compaction, and the SDK's auto-compaction is off.
- Retrieval counts what a session holds from the session's opening record, which replaces the
  compaction and rebuild records as that point.
- The existing context blocks, the timer and outcome inputs, and the change notes move to the
  `<system-message>` element.
- A moment that you keep from the client reaches a running session through the events block.
