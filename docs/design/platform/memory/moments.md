# Moments

- Decisions: [0011](../../../decisions/0011-memory-writes.md),
  [0015](../../../decisions/0015-taint-scope.md),
  [0031](../../../decisions/0031-memory-capture-context-and-removal.md),
  [0037](../../../decisions/0037-moments.md)

A moment is a range of records in one thread that nixie keeps whole, with a title, your note and the
model's reflections beside it. The moment refers to its records by sequence and never copies them,
so the event log stays the one history. A model reaches a moment only through a tool call, either
from a search or from a memory item's link, and never through per-turn retrieval. Destroying a
moment shreds the moment's own text and leaves the conversation in the event log.
[The memory store](store.md) covers the facts that moments sit beside.

## The first build

The first build implements every part of this design with keyword search:

- **Records and tools:** the moment record kinds, the `moments` projection and the 6 moment tools.
- **Links:** "because" links from memory items to moments, returned by `memory.recall`.
- **The client:** the timeline, the moment view, edits, and destroy behind a preview.
- **Export:** moments in the memory export.

Each extension below keeps the same contract:

- **Semantic search:** titles, notes and reflections in the local encoder index from
  [memory in context](context.md#retrieval), for `moment.find` and the timeline only.
- **Redaction:** removing one part of a span, such as a pasted secret, with a mark in its place.
- **Several threads:** one moment over several spans, such as a conversation and the task it
  started.
- **Links from rules:** a rule in the definitions source that refers to a moment.
- **Behaviour checks:** kept moments replayed as cases after a model swap.

## What a moment holds

| Part       | Holds                                                                  | Written by                       |
| ---------- | ---------------------------------------------------------------------- | -------------------------------- |
| Span       | One thread and its first and last record sequence                      | The `moment.keep` call           |
| Title      | A short name, marked as model-written when a model wrote it            | You, or a model under your rules |
| Note       | Why the moment matters, in your words                                  | You only                         |
| Reflection | The model's reading of the moment, labelled with its model ID and date | A model                          |
| Links      | "Because" links from memory items to the moment                        | You, or a model under your rules |

The span covers every record in its range: your messages, the replies, tool calls, tool results,
approvals and the records of the workers the thread started. A span holds what the event log holds,
so the model's reasoning is in a span only when the log records it.

A note comes from the client, or from chat when its text appears word for word in a message you
typed. The quote check from [0011](../../../decisions/0011-memory-writes.md) decides the chat case.
A model never writes or suggests a note. **Why:** the note records why the moment mattered to you at
the time, and a model-written note would be a reconstruction.

A moment can hold several reflections. A model edits only a reflection whose label carries its own
model ID, and a different model adds a reflection of its own. You remove a reflection in the client,
and never edit one. **Why:** an edited reflection would no longer hold the words of the model in its
label. nixie sets the label from the model ID on the record, never from the model's arguments.

## Records and the projection

Moments are event-sourced. These record kinds fold into the `moments` projection:

| Kind               | Written when                                                    |
| ------------------ | --------------------------------------------------------------- |
| `moment_kept`      | A moment is kept, with its span, title and any first reflection |
| `moment_edited`    | The edges, the title, the note or a reflection changes          |
| `moment_linked`    | A memory item is linked to the moment, or a link is removed     |
| `moment_retired`   | The moment is retired or restored                               |
| `moment_destroyed` | The moment's keys are shredded                                  |

The title, the note and each reflection are erasable fields under their record's own key. The
projection holds the thread, the span's sequences, the links and the state, and never free text.
**Why:** a fold receives only the plain payload, so a rebuild after a destroy gives the same rows.

Every edit is a new record, so a moment keeps its history, and the client shows "edited" with the
date. The span's edges change within one thread only. The span's records never change, because the
event log is append-only. A link goes with its memory item when that item is destroyed.

## The tools

| Tool            | Effect | Does                                                                |
| --------------- | ------ | ------------------------------------------------------------------- |
| `moment.keep`   | `note` | Keeps a span with a title, and optionally a reflection              |
| `moment.edit`   | `note` | Changes the edges or the title, or adds or edits a reflection       |
| `moment.link`   | `note` | Links a memory item to a moment, or removes the link                |
| `moment.retire` | `note` | Retires a moment, with undo                                         |
| `moment.find`   | `read` | Searches titles, notes and reflections by keyword, or lists by date |
| `moment.read`   | `read` | Returns the span in sequence order, a page at a time, with a cursor |

The moment tools declare `note`, as the memory write tools do, so the starter rule `allow-notes`
allows them, and a rule on `moment.keep` makes nixie ask first. A "keep this" in chat runs through
the consent check like any request in your own words. A task that runs while you are away keeps a
moment whenever your rules allow it.

`moment.read` caps each page in tokens. **Why:** a span over a long task, such as an hour of web
browsing, holds thousands of records with tool results.

## Reading moments back

`memory.recall` returns each item's links as moment IDs and titles, never moment text. The tool
descriptions of `memory.recall` and `moment.read` tell the model to read a linked moment when the
reason behind a fact matters. Per-turn retrieval and the pinned core never include a moment's title,
note or reflection.

`moment.read` returns each record with its source of content. A span that holds outside content
stays untrusted when it is read, so the task that reads it is tainted under
[0015](../../../decisions/0015-taint-scope.md), as it would be by reading that content first-hand.

The client shows moments on a timeline in time order, with keyword search, and retired moments
behind a filter. A moment opens as its span, with the note, each reflection with its label, and the
links beside it. The keep notice offers "Add a note" once, and a note added later shows its own
date.

## Removal and forgetting

`moment.retire` from chat retires a moment, with undo. Only a checked action in the client destroys
a moment, after a preview bound to the moment and its versions, as
[0031](../../../decisions/0031-memory-capture-context-and-removal.md) sets for memory. An edit after
the preview opens makes the preview stale.

Destroying a moment shreds the keys of its own records: every version of the title, the note and
each reflection. The span's records stay in the event log, because they are your conversation, not
the moment.

A kept span blocks any automatic pruning of its records. A forget always wins over a span, and a
record inside a span that becomes unreadable shows as a gap in the moment.

## Storage, backup and export

Moments add no store. Their records and projection live in `nixie.db` and their keys in `keys.db`,
so the [backups](../deployment/backup-and-restore.md) and the forget path cover them with no change.
The memory export includes moments, with each span's text decrypted, under the `export` effect.
