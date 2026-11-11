# A moment across several threads

A [moment](moments.md) in the built code refers to one span: a range of records on one thread. This
doc covers a moment that refers to several spans on several threads, such as one span of a
conversation and one span of the task that the conversation started, read in one order. How nixie
records such a moment is not designed. Decision record [0037](../../decisions/0037-moments.md)
defines a moment as one span, and nixie builds no moment of several spans until you reopen that
decision. This doc holds the requirements that a design of such a moment must satisfy.

Terms are in the [glossary](../../glossary.md), and [moments](moments.md) defines a span and a span
record. Each point that is not settled is marked in this doc as `(open: <name>)`.
[The open list](open/moments.md) holds each point under that name, with its options and its tracker
issue. Whether to reopen the decision is the first of them. (open: reopen moment definition) Slice 7
of [the slices](slices/moments.md), the list of work for the moments designs, is the step in which
you decide it. The other moments designs have a file of TypeScript types in `sketches/moments/`.
This doc has none, because no record of such a moment is agreed.

"Built" describes the code as it stands. The sections after it describe what a design must satisfy
and what is left to design.

## Built

- A moment records one thread, one first sequence and one last sequence. The `moment_kept` record,
  the `moment_edited` record, the row of the `moments` projection, the export's moment and the
  moment schemas of the API contract package each hold that one span.
- `readMomentSpanPage` reads a span's records by the moment's one thread, so a record on any other
  thread is never part of a span. The moments design under `docs/design/platform/` holds a sentence
  that puts the records of a thread's workers in a span, and the code does not. (open: span worker
  records)
- When a model calls `moment.keep` or `moment.edit` with a span on a thread that is not the caller's
  own, the moment store refuses the call with `other_thread`.
- When a call gives a span whose first or last sequence fails the store's span check, the moment
  store refuses the call with `bad_span`.
- A change of a span's first or last sequence carries the moment's version. The store refuses the
  change as stale when the moment has a higher version.
- Each record has a sequence number. nixie assigns the numbers in commit order across the whole log,
  so 2 records on 2 threads never share one.
- A moment has text of its own beside its span: a title, your note and the reflections. When you
  destroy a moment, nixie deletes the encryption key of that text, so the text is unreadable. The
  span's records remain.
- Under decision record 0037, a model keeps a span of its own thread only.
- Under decision record [0051](../../decisions/0051-memory-tools-on-tasks.md), the tool list of a
  `task.start` call can hold `moment.keep` and the other tools that write a moment. A task that
  holds them can keep a span of its own thread. The notes behind this design call that rule decided
  in one place and open in 2 others. (open: task moment tools)
  [Memory tools on a task](memory-task-tools.md) owns which tools a task holds.

## What a design must satisfy

- Each span sits inside one thread: its first and its last sequence are on that thread.
- nixie checks each span against the thread of that span. It returns `bad_span` for a span that
  fails the built span check. It returns `other_thread` for a model's span on a thread whose spans
  that model may not add. Who may add a span of which thread is open. (open: span adder)
- A design changes nothing for a moment with one span: `moment.read` returns the same result for it,
  the `moments` projection builds the same row from its records, and the export holds the same
  moment. A design never changes a released record or a released migration.
- The records of 2 spans on 2 threads have one order by sequence, because sequence numbers are
  global across threads. Whether `moment.read` returns the records in that order is open. (open:
  span read order)
- A caller of `moment.read` gets every record of every span through one cursor. Each record holds
  its thread. A span added between 2 pages never makes a page skip a record or repeat one.
- Adding, moving or removing one span is one change that carries the moment's version. The store
  refuses it as stale when the moment has a higher version.
- When you destroy a moment, nixie deletes the encryption key of the moment's own text. The records
  of every span remain.
- Pruning of the event log skips every kept span. Decision record 0037 sets that rule for one span.

## What a design changes

The memory module owns the design, and a design adds no interface to another module. Each of these
holds a moment's span, so a moment with several spans changes each:

- the payloads of `moment_kept` and `moment_edited`;
- the `moments` projection;
- the inputs of `moment.keep` and `moment.edit`;
- the result and the cursor of `moment.read`;
- the moment schemas of the API contract package;
- the moment of the memory export.

The 2 record payloads are costly to change after a release, because nixie never deletes a record
from the log. The contract schemas are costly to change too, because the API contract package is
published to npm.

## Not designed

Beside the choice to reopen the decision, each of these waits for a choice in the open list:

- Who adds a span of which thread to a moment. (open: span adder)
- The order in which `moment.read` returns several spans. (open: span read order)
- Which threads `log.read_image` opens an image from, when a moment's span holds a message of yours
  with an image. [Moments](moments.md) holds the rule for a moment with one span. (open: photo
  thread)
- What a release without the design does with a moment record of several spans, when a deployment
  rolls back to that release. (open: parked rollback)
