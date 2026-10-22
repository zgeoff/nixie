# The memory writer

The memory writer captures the facts the user states in passing, so memory grows without the user
asking for each item. It reads the conversation in batches of committed turns, runs a fresh model
session over each batch, and publishes what the session staged, with the writer's cursor, in one
database transaction. A crash anywhere in a batch therefore leaves either the whole batch published
or none of it, and a rerun never publishes a batch twice. The `modules/memory` package holds the
writer, beside [the memory store](./store.md) whose verbs it calls.

The writer is a system task in [the task runtime](../core/tasks.md): it never finishes, and it waits
between batches. [Memory writes](./writes.md) covers the content gate that checks a write, and
[model profiles](../core/model-profiles.md) cover the `memory-writer` role that picks its model.

```mermaid
flowchart LR
    plan[Plan the batch] --> extract[Run the session]
    extract --> gate[Gate each write]
    gate --> publish[Publish in one transaction]
    publish --> plan
```

## Batches

A batch covers the conversation's records after the writer's cursor: the user's messages and the
replies to them, as whole turns. A batch starts when enough of the user's messages wait, when the
conversation goes idle, or when the oldest waiting message reaches its maximum age, whichever comes
first. The age limit keeps capture moving while a busy conversation never goes idle. A pace limit
spaces batches out, and a token budget cuts a long run of turns, though the first turn always goes
in whole.

The triggers need the time each message arrived on the task runtime's clock, which a record's
wall-clock time is not. The writer subscribes to the conversation, and for each of the user's
messages it writes a wake into its own inbox that holds the message's sequence and the clock time.
The wake both starts a step and records the arrival. A wake lost to a crash costs nothing, because
every start of the writer wakes it again, and a message with no recorded arrival counts as due.

The writer records each batch it plans before it runs the session. A rerun after a crash finds that
record and takes the same bounds, so the batch it runs again is the one it lost.

## The catch-up

The server starts the writer, with the store's batch gate, on every start of nixie that leaves the
writer on. The writer's first start records the log's head sequence as the point where memory
started. Every batch that begins before that point is part of the catch-up, which reads the
conversation from the start of the log. A catch-up batch stops at the start point, so a message that
arrived after memory started always runs in a live batch. The cursor starts at the first record of
the log, so the catch-up begins by itself on that first start.

A catch-up batch posts no notice, because a notice per batch of old history would bury the
conversation. The batch that ends the catch-up posts one quiet notice with the count of items it
took in. When none of the user's earlier messages wait, that batch runs with no model call.

## The writer turned off

The deployment configuration can turn the writer off. The server then never starts the writer, so
the writer records nothing, stages nothing and posts no notice, and the memory view shows it as off.
Memory that the conversation writes through its own tools goes on as before. When an earlier start
left records in the writer task's inbox, the task runners read them in a step that does nothing
else, so they never reach the conversation's step. The cursor stays where the writer left it, so a
later start with the writer on resumes from that record.

## A batch's session

Each batch runs one fresh model session in the writer's own worker sandbox on the conversation
image, never the conversation's sandbox, because the replies it reads can carry outside content. A
fresh session keeps one batch's reading from steering the next. The system prompt holds the persona
in force, introduced as the assistant's persona for reference, before the writer's rules, so the
writer frames what it stores the way the assistant speaks of the user. The persona costs no capture:
a rerun of the same live batches with and without it stored the same facts and applied no bad
candidate either way. It costs input only, because every batch sends the persona again.

The rules tell the writer who is who, because a persona that says "you are" the assistant, beside
the user's own "you" addressed to the assistant, lets a model file a fact about the assistant as one
about the user. The writer is the note-taker and never the assistant. Each message carries its
author's configured name and role, such as the user's name with `(owner)` and the assistant's name
with `(assistant)`, or the bare role where no name is set. A "you" in the user's messages means the
assistant. Every memory the writer stages has a subject: owner, for a fact about the user, or
shared, for something between the user and the assistant, such as a deal, a nickname the user uses
or a running joke. A nickname or a joke that only the assistant used gives no memory.

The rules ask for each memory as one plain factual sentence that names the user by the name in the
owner section of the deployment configuration, or calls the user "the owner" when the section sets
none, and a shared memory names the assistant too, so the writer's items read like the ones the
conversation saves. The rules keep the user's own distinctive words where those words carry the
meaning, because a generic paraphrase loses what made the fact worth saving. A correction of a fact
or a deal edits the item that holds it and never adds a second item.

The prompt holds the batch's records with their sequences and the time each was sent, in the zone
the user sent it from or the deployment's default zone, the user's pasted spans marked, a marker
line for each image the user sent and never its bytes, the active items, and the pending proposals
with the item each one changes, each with its subject and any end time it sets. It lists every
active item while the list fits its budget, else the items a keyword recall over the batch finds.
Neither the list nor a recall shows a self-note, and the pending proposals leave out a self-note's,
because a self-note is the assistant's own to write. A rule tells the writer to stage nothing for a
fact that a pending proposal already holds, even in other words, because the gate merges only a
proposal of the same text. One exception: a batch that moves or drops a proposal's end time stages
the fact again with the new end time, which the gate keeps as a proposal of its own.

The session's tools are recall, remember, edit, retire and flag-self-note. Remember only creates an
item, and edit is the one tool that changes an item's text, as in the conversation. Remember and
edit take the subject owner or shared, and their input schema refuses self, so only the conversation
writes a [self-note](./writes.md#self-notes). Recall, remember, edit and retire stage writes instead
of applying them.

Staging refuses a write that cites a record outside the batch, a change to an item the session was
never shown, a second change to the same item, an edit that changes its item's subject, and a write
whose [end time](./writes.md#end-times-on-writes) passed before the batch ran, and the refusal goes
back to the model at once. A fact that ended before the writer reached it therefore never enters
memory, and the rest of the batch goes on. The prompt tells the writer to stage a fact with a stated
end even when the end looks past, and to leave that check to staging, because a session's own idea
of the date can differ from the batch's start. Staging binds each change to the version the session
was shown, never to a version the model sent.

A batch's staging belongs to the step that opened it. A step that lost its lease and stops late
closes only its own staging, so it never empties the staging of the step that replaced it.

### Flags of possible self-notes

When the user says something about the assistant worth keeping, the writer flags it instead of
writing it: flag-self-note takes one line and the user's message it came from, and creates no item.
A fact that mixes the user and the assistant becomes the user's or the shared part and a flag for
the assistant's part, and the writer never splits a current item. The batch publishes each flag
whose message is still readable as a record of its own in the conversation's thread, with the line
in its erasable fields. The conversation's events block lists it as the note-taker's nudge, not a
note: "possible self-note:" with the line and the event number of the user's message, and the advice
to write the self-note in the assistant's own voice if it rings true and to let it go if not. A flag
whose line a forget erased lists nothing.

## Publishing

The host runs the content gate over each staged write outside the database transaction, because a
gate check can call a model. A write that repeats the text of an item the session was shown skips
the gate and writes nothing. One exception: an edit that keeps its item's text and moves or clears
its end time runs the gate as any edit does.

The batch gate runs the checks that [memory writes](./writes.md) sets out for a single write, one
staged write at a time, against the one message the write cites. That message is the write's whole
evidence, never a window of the user's latest messages, because a catch-up batch cites messages far
older than any window. The quote must be typed in that message, a memory's tokens must appear in the
quote, and the checker must confirm it; a message that backed a forgotten item never backs a write
again. A write that passes applies with its quote's place in the message as its evidence. An edit of
a pinned item waits for review even when every check passes, because the pinned core rides every
turn and a batch must never fail on the core's budget. Every other write becomes a proposal from the
memory writer: the gate seals its text and builds its records, and the batch publishes them in its
own transaction. A batch's proposals share one group for the cap and the notice. An edit or a
retirement whose item moved on or was forgotten since the session read it fails the gate before any
check runs, and so does a retirement of a retired item. The batch then runs again at once against
the item as it stands.

A proposal for a new item seals its text under a key the gate creates before the transaction. When
the proposal never publishes, because its batch split, ran again or failed, the writer removes that
key, so a key in the key store always seals a record or a published proposal.

One transaction then publishes the batch:

1. It checks that the step still holds its lease at the task clock's time inside the transaction, so
   a step that lost the writer to another runner, or whose lease expired while it waited for the
   delivery lock, writes nothing.
2. It checks that the batch is still the one the cursor waits on, so a rerun after a commit that a
   crash hid publishes nothing twice.
3. It reads each cited message again and leaves out every write whose message the user forgot during
   the session, or whose message backed an item the user forgot since the gate ran, and the batch
   counts them as dropped.
4. It checks that the item each proposal targets still stands at the version the session read, so
   the user can approve every proposal the batch publishes, and it applies each write at that
   version. A write or a proposal whose item changed or was forgotten in the meantime aborts the
   transaction, and the batch runs again at once against the item as it stands.
5. It writes the proposals' records one at a time, and merges each proposal that makes the same
   change as a pending one into it, so a batch's proposal sees every proposal before it. It then
   writes the batch's notice and the advanced cursor.

A batch that would hold more proposals than the proposal cap allows never publishes them. A batch
over several of the user's messages splits in half and runs each half again, so each proposal still
points at one message. A batch over one message keeps the first proposals up to the cap and counts
the rest as dropped, because no smaller batch exists.

## Failure and backoff

A batch that fails, such as one whose model call the provider refuses, records the error and backs
off, doubling the wait after each consecutive failure up to a maximum. The writer step never throws
the error, so the task never fails and the writer resumes on its own once the model answers. A
published batch clears the failure count. The memory view reads the writer's cursor, its backlog,
whether the catch-up still runs, and its last error with the time it tries again.

[The crash tests](../core/crash-tests.md) kill nixie at each boundary of a batch, in the catch-up
and in a live batch, and check that the batch publishes once.

## Changes the conversation hears of

A conversation turn hears of memory that changed outside it through
[the events block](../core/conversation-turns.md#the-events-block), where memory registers its kinds
of event. A memory change is an item that anything but the conversation itself wrote, such as a
writer batch or an edit in the memory view. Each item lists once, at its latest version in the
block's range, with its current text. The catch-up's items appear as one event that counts them,
because the catch-up covers conversation the user already had. A merge names each of the
conversation's pending proposals that another source proposed again, so the conversation knows its
proposal merged and still waits. A flag of a possible self-note lists as the note-taker's nudge, as
[flags of possible self-notes](#flags-of-possible-self-notes) sets out.

The block reads a listed item's text through a recall marked as a turn note's, and only after its
cap, so the recall records no item the block leaves out. A rating binds to the newest recall without
that mark, so the item list the turn's own recall gave stays the one the model rates. Memory's kinds
leave out an item that a forget has begun before the block applies its cap, so a forgotten item
never takes the place of a later event. The recall checks again, because a forget can begin between
the read and the recall.
