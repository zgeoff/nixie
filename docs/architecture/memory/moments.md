# Moments

A moment is a span of one thread of the event log that nixie keeps whole, with a title, the user's
note and the reflections of the models that read it. The moment refers to its records by sequence
and never copies them, so the event log stays the one history, and a destroy shreds only the
moment's own text. A model reaches a moment only through a tool call, never through per-turn
retrieval or the pinned core. The `modules/memory` package holds moments beside the memory store,
under [0037](../../decisions/0037-moments.md).

[The event log](../core/event-log.md) covers the records a moment spans, and
[erasable fields](../core/erasable-fields.md) covers the keys that hold its text.
[The memory store](./store.md) covers the items that moments link to.

## Records and the projection

Moments are event-sourced, and every change to a moment is a record of its own:

| Kind               | Written when                                           | Its erasable fields  |
| ------------------ | ------------------------------------------------------ | -------------------- |
| `moment_kept`      | A moment is kept, with its thread, span and keeper     | The title            |
| `moment_edited`    | The edges, the title, the note or a reflection changes | The new text, if any |
| `moment_linked`    | A memory item is linked to the moment, or unlinked     | None                 |
| `moment_retired`   | The moment is retired or restored                      | None                 |
| `moment_destroyed` | A destroy starts, and again when its cleanup completes | None                 |

Each record's free text sits in its erasable fields under the record's own key, so the title, the
note and each reflection version have one key each. The projection holds the thread, the span's
first and last sequences, the state, the version, who kept the moment, the links, each reflection's
model label, and the sequence of the record that holds each current text. It never holds free text,
so a rebuild after a destroy gives the same rows as the live projection. The fold removes a link
when the forget of its memory item starts.

Every change binds to the version the caller read, and a change that finds the moment moved on fails
as stale and writes nothing. The check and the record commit in one write transaction.

## Who keeps and who writes

A model keeps a span of its own thread only, because the thread comes from the task run and never
from the tool's arguments. The conversation therefore keeps moments from its conversation with the
user, and a task keeps moments from its own work. The store refuses a keep from the memory writer's
thread, and the memory writer's tool list holds no moment tool. The user keeps a span of any thread
through a [checked action](../channels/api.md#checked-actions) in the client. The API makes the
moment's IDs before the keep's transaction and keeps them as the action's result, so the API returns
the first keep's IDs to a retry.

The parts of a moment have different writers:

- **The title:** the keeper, and later any model or the user.
- **The edges:** the user, or a model on the moment's own thread.
- **The note:** the user only.
- **A reflection:** a model, which nixie labels with the model ID of the task run. A model edits
  only a reflection whose label holds its own model ID, and the user removes a reflection.

`moment.keep` takes a title and refuses a reflection, so a model writes its reflection on a later
turn, after it reads the span again.

## The tools

| Tool            | Effect | Does                                                                |
| --------------- | ------ | ------------------------------------------------------------------- |
| `moment.keep`   | `note` | Keeps a span of the caller's own thread with a title                |
| `moment.edit`   | `note` | Changes the title or the edges, or adds or rewrites a reflection    |
| `moment.link`   | `note` | Links a memory item to the moment, or removes the link              |
| `moment.retire` | `note` | Retires a moment, or restores it                                    |
| `moment.find`   | `read` | Searches titles, notes and reflections by keyword, or lists by date |
| `moment.read`   | `read` | Returns the moment's text and its span in order, a page at a time   |

The read-only rule allows every moment tool, because each declares `note` or `read` and runs direct.
A model names a moment by its [short ID](../core/database.md#short-ids). A refusal returns to the
model as the tool's error, in a fixed sentence that holds no moment text.

`moment.keep` returns the moment's short ID, the weekly count and a pending reflection, as JSON with
no prose. `moment.find` decrypts every candidate's text in process memory, a batch at a time, and
matches each query word against it, because a full-text index on disk would keep a destroyed
moment's words.

`moment.read` returns the conversation of the span by default: the user's messages and the model's
replies, in order. The raw fields of tool calls, tool results and step markers bury those words, so
they come only in a read that asks for all records, which returns every record in the span. Each
record comes with its event ID, its kind, its time, its payload, its policy decision, its text and
its source of content. Either read returns the records as untrusted, so a span that holds outside
content taints the task that reads it, even when the outside content itself is left out. The payload
holds what the text leaves out, such as a called tool's name or an action's outcome. A record with
no source holds only what nixie itself wrote, and a record whose key is gone shows as a gap. Each
page stops at a token cap and returns a cursor, because a span over a long task holds thousands of
records and a moment gathers reflections over time. The first page holds the note, the reflections
follow under the same cursor, and then the records. A single reflection or record larger than a page
arrives cut to fit it. Every page repeats the title, so a title long enough to crowd out the rest of
the page arrives cut as well.

The records of a moment tool call hold references only: moment IDs, versions and event IDs. Each
call record leaves out the title, the reflection and the search words, and each result record lists
what the call returned by ID. A destroy therefore leaves no readable copy of the moment's text in
them.

## Reading moments back

`memory.recall` returns each item's links to active moments as short IDs and titles, and its result
record holds the linked moments' IDs only. The tool descriptions of `memory.recall` and
`moment.read` tell the model to read a linked moment when the reason behind a fact matters. Per-turn
retrieval runs the store's own recall, which returns no links, so no moment text reaches a turn that
way.

nixie counts the moments kept over the week before an instant, across every thread, and leaves out
destroyed ones. The count shows in three places and never blocks a keep:

- **The `moment.keep` result,** as the moments kept this week.
- **The events block,** which notes a moment that another task or the user kept, with its title, its
  short ID and the count over the week that ends at its keep time. Each read of the block counts
  again from the moments that survive, so a replay after a destroy counts one fewer. A moment the
  conversation keeps shows in its own tool result instead, and a replay after its own destroy finds
  the title shredded and leaves the event out.
- **The session's [status](../core/session-opening.md#status),** which splits the count by keeper
  and counts the moments that wait for a reflection.

## Destroying a moment

Only a checked action in the client destroys a moment, and no tool reaches it. The client first
reads a preview at the moment's version, which shows the title, the note and the reflections, counts
the texts and links the destroy removes, and counts the span's records that stay. The destroy binds
to the version the preview showed, so an edit after the preview makes it stale, and it runs as a
durable operation in 2 parts:

1. One write transaction commits the client action, checks the state and the version, and appends
   the record that marks the moment destroying. A refusal rolls the client action back with it. From
   then on, no read, find, link or edit reaches the moment.
2. The cleanup deletes the key of every record that holds the moment's text, runs the
   [session cleanup](./context.md#forgetting-and-the-live-session) with the moment as its cause, and
   appends the record that marks the destroy complete.

Every step of the cleanup is safe to run twice. A retry of the action with the same client action ID
runs the cleanup of a destroy that a failed cleanup left, and the store's start runs it for every
moment still destroying. The session cleanup erases every compaction summary and purges the session,
because a summary or a transcript can hold the moment's text. The span's records keep their own
keys, so the user's messages and the replies that quote the moment stay readable.

The [memory export](./export.md) holds every moment with its span's text.
