# 0037: Moments

- Date: 2026-10-11
- Status: decided

A moment is a span of one thread that nixie keeps whole: a range of event-log records, with a title,
your note and the model's reflections beside it. Memory items are the statute: facts to act on.
Moments are the case law: the conversations where a rule was set or applied to a hard case, kept in
their own words. A later model, which can differ from the one that took part, reads a moment to
apply a rule's reason to a case the rule does not cover. You read a moment to see how a decision was
reached.

## What a moment holds

| Part       | Holds                                                                  | Written by                          |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------- |
| Span       | One thread and a first and last record sequence                        | The tool call that keeps the moment |
| Title      | A short name, marked as model-written when a model wrote it            | You, or a model under your rules    |
| Note       | Why the moment matters, in your words                                  | You only                            |
| Reflection | The model's reading of the moment, labelled with its model ID and date | A model                             |
| Links      | "Because" links from memory items to the moment                        | You, or a model under your rules    |

The span covers every record in its range: your messages, the replies, tool calls, tool results,
approvals and the records of workers the thread started. nixie never copies the span's text. The
records stay in the event log, append-only, and the moment refers to them by sequence.

A note comes from the client, or from chat when its text appears word for word in a message you
typed, by the quote check from [0011](0011-memory-writes.md). A model never writes or suggests a
note.

A moment can hold several reflections. A model edits only a reflection whose label carries its own
model ID, and a different model adds a reflection of its own. You remove a reflection in the client,
and never edit one, because an edited reflection would no longer be the model's words.

## Records and the projection

Moments are event-sourced. Records of the kinds `moment_kept`, `moment_edited`, `moment_linked`,
`moment_retired` and `moment_destroyed` fold into a `moments` projection. The title, the note and
each reflection are erasable fields under their record's own key. The projection holds the thread,
the span's sequences, the links and the state, and never free text.

Every edit is a new record, so a moment keeps its history as a memory item does. The client shows
"edited" with the date. A link goes with its memory item when that item is destroyed. The span's
edges are editable, within one thread. The span's records never are.

## The tools

| Tool            | Effect | Does                                                                    |
| --------------- | ------ | ----------------------------------------------------------------------- |
| `moment.keep`   | `note` | Keeps a span with a title, and optionally a reflection                  |
| `moment.edit`   | `note` | Changes the edges or the title, or adds or edits the model's reflection |
| `moment.link`   | `note` | Links a memory item to a moment, or removes the link                    |
| `moment.retire` | `note` | Retires a moment, with undo                                             |
| `moment.find`   | `read` | Searches titles, notes and reflections by keyword, or lists by date     |
| `moment.read`   | `read` | Returns the span in order, a page at a time, with each record's source  |

The moment tools declare `note`, as the memory tools do, so the starter rule `allow-notes` allows
them. A rule on `moment.keep` makes nixie ask first. A "keep this" in chat runs through the consent
check like any request in your own words. A model can keep a moment on its own, such as during a
task that browses the web, whenever your rules allow it.

## Reading moments back

A moment reaches a model only through a tool call. Per-turn retrieval and the pinned core never
include moments. `memory.recall` returns each item's links as moment IDs and titles, and the tool
descriptions tell the model to read a linked moment when the reason behind a fact matters.

`moment.read` returns the span in sequence order, a page at a time with a cursor, so a span over a
long task stays readable. Each record carries its source of content. A span that holds outside
content stays untrusted when it is read, so the task that reads it is tainted under
[0015](0015-taint-scope.md), as it would be by reading that content first-hand.

The client shows moments on a timeline in time order, with keyword search, and opens each one as its
span with the note and the reflections beside it.

## Removal and forgetting

`moment.retire` from chat retires a moment, with undo. Only a checked action in the client destroys
a moment, by shredding the keys of its own records: every version of the title, the note and each
reflection. This follows the rule in [0031](0031-memory-capture-context-and-removal.md) for memory.
Destroying a moment leaves the span's records in the event log, because they are your conversation,
not the moment.

A kept span blocks any automatic pruning of its records. A forget always wins over a span: a record
inside a span that becomes unreadable shows as a gap in the moment.

## Storage, backup and export

Moments add no store. Their records and projection live in `nixie.db`, and their keys in `keys.db`,
so the backups from [0032](0032-offsite-backups-and-replication.md), the forget path from
[0010](0010-memory-store.md) and the principle "Your data stays home" cover them unchanged. The
memory export includes moments, with each span's text decrypted, under the `export` effect.

## Why

- The event log holds every message and reply word for word, so a moment needs a boundary, a name
  and a reason, not a second copy of the text.
- One copy of the conversation keeps one forget path.
  [0031](0031-memory-capture-context-and-removal.md) rejected a second transcript copy for the same
  reason.
- A memory item holds a fact without its reason. A rule applied to a case it does not cover needs
  the conversation where the rule was set, and a link leads a model from the fact to that
  conversation.
- Keeping moments out of per-turn retrieval keeps them from becoming memory with extra steps: a
  moment stays whole and in its time, and a model reads it on purpose.
- A label with the model ID and the date stops a later model's reading from passing as the reading
  of the model that took part.
- Under the principle "Behaviour is data", the deployment's rules decide whether nixie keeps moments
  on its own, and the system ships the mechanism only.

## Alternatives

- **A copy of the span under the moment's own key.** A moment then stands alone and exports simply,
  and the conversation gains a second copy with a second forget path.
- **Moments in per-turn retrieval.** A model would meet moments without asking, and similarity
  search over moments would turn them into a store of facts.
- **Keeping only on your request.** It removes the rule, and a task that runs while you are away
  could not keep the span that explains what it did.
- **A model-written summary in place of the span.** It loses the wording that a later case turns on,
  and a summary of an untrusted conversation can carry an injected instruction.
- **A new `moment` effect.** A moment write does the same as a memory write, so it shares `note`.

## Consequences

- Each reply record carries the model ID, so a reflection's label and the rule for editing a
  reflection have a source.
- Any future pruning or retention of the event log skips records inside kept spans.
- Record sequences stay stable through migrations and restores, because spans refer to them.
- A span holds what the event log holds. Whether the log keeps the model's reasoning is a separate
  question.
- Later work extends moments with no change of contract: semantic search over moments, redaction,
  moments across several threads, links from rules, and kept moments replayed as behaviour checks
  after a model swap.
