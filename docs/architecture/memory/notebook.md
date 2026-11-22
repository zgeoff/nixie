# The notebook

The assistant keeps a notebook for thinking that is too long or too unsettled for memory: research,
a diary, an argument with one of its own memory items. A note has a short ID, a title, a markdown
body of up to 50,000 characters, tags, versions and a private flag. The assistant reads a note only
when it opens or searches the notebook, because nixie never puts a note in the context it builds for
a turn. The `modules/notebook` package holds the notebook beside the memory store.

[The event log](../core/event-log.md) covers the records a note is made of, and
[erasable fields](../core/erasable-fields.md) covers the keys that hold its text.
[The memory store](./store.md) covers the items and [moments](./moments.md) the moments that a note
links to.

## How a note is stored

A note is made of log records on no thread: `notebook.note_written` for the first version,
`notebook.note_edited` for each later one, `notebook.linked` and `notebook.unlinked` for its links,
and `notebook.note_read`, `notebook.private_opened`, `notebook.note_forgetting` and
`notebook.note_forgotten` for what happens to it. A version record holds the whole title, body and
tags in its erasable fields, so reading any version decrypts one record, and nixie never rewrites a
version. A link record holds its reason in an erasable field. Because the records sit on no thread,
a reset of the conversation leaves every note readable, as it leaves memory items, and forgetting a
message never erases a note's records.

Three tables hold the structure and never any free text: `notebook_notes` (the state, the current
version, the record that holds the current text, the private flag and the times of the last read and
the last opening by the user), `notebook_versions` and `notebook_links`. The log's projection builds
them. A link stores the UUID of its target and the kind of table to look in, because a short ID
alone does not show whether it belongs to a note, an item or a moment. Every result shows the short
ID. A link to an event stores the event's decimal ID, since events have no short ID.

## The indexes

At start, the notebook decrypts the current version of every active note and builds a keyword index
and a vector index in process memory only, with the chunker, encoder and index code that memory
exports. An index on disk would keep a forgotten note's words. The vectors encode in the background,
and a meaning search reports `isMeaningPartial` until the encoding ends. Before each search, the
notebook encodes the notes written or edited since the last one and waits a short time for the
encoding to end.

The default `notebook.max_notes` sits below the 1,000 notes of the first design, because a start
with that many full notes encoded for longer and held more memory than the notebook's budget allows.
The measurement and the budget sit in a comment beside the default in the code. A deployment with
more cores or shorter notes can raise the limit.

## The tools

The 9 tools are `notebook.write`, `edit`, `read`, `history`, `find`, `check`, `link`, `unlink` and
`walk`. The 4 that change a note declare the `note` effect, so the starter rule `allow-notes` allows
them with no approval, and the other 5 declare `read`. Notes skip the memory gate, which checks
claims about the user, because a note is the assistant's own writing. The conversation holds all 9,
and a task holds one only when its tool list names it.

- An edit binds to the version it read, and the check and the record commit in one write
  transaction. An edit that sets only `append` binds to the current version at commit, so 2 tasks
  can append to one note.
- `notebook.read` pages a long body at a paragraph break so that each result fits the recall page
  limit, and part 1 alone carries the links.
- A walk follows links both ways and visits each node once. It returns references and labels, never
  the text of a note, an item, a moment or a record. A target that was forgotten is listed as gone
  and the walk goes no further from it.
- The check is built when it is read. An orphan is an active note that holds no link and that no
  active note links to, and a note named only in another note's text counts as one.

The call record of every notebook tool leaves out the free text of the call, and the result record
holds short IDs and versions only, with each UUID under `hidden.uuids`
([tool calls](../connectors/tool-calls.md#records)). A forget of a note therefore leaves no readable
copy of it in a tool's records.

## What memory sees of a note

The server hands memory an `ItemLinkCounts` that the notebook implements. Recall and per-turn
retrieval show `disputedBy` and `supersededBy` on an item: a count of active notes, private ones
included, above 0 only. A count holds no note ID and no title, and it falls when a note is unlinked
or forgotten. Memory never imports the notebook, and the root `turbo.json` denies the dependency.

`code.run` takes a note as an input file only when the caller's tool list holds `notebook.read`. The
[code tool](../connectors/code-tool.md#the-steps-of-a-call) owns the rule.

## Private notes

The flag changes nothing for the assistant: every tool reads and finds a private note as any other,
and `notebook.read` shows when the user last opened it. The web client's calls leave out a private
note, and every link to or from one, unless the call sets `showPrivate`, and the check is built over
every note before the private entries go, so a note that only a private note links never shows as an
orphan. The body stays out of `notebook.readNote`. Only the checked action `notebook.openPrivate`
returns it, with the version before it, and appends `notebook.private_opened`, so a refetch or a
retry never moves the mark.

## Forgetting a note

Only the user forgets a note, through the checked action `notebook.forget` in the web client, and no
tool reaches it. The [API](../channels/api.md#forgetting-a-note) owns the call. The forget runs in 2
parts, as a [moment destroy](./moments.md#destroying-a-moment) does:

1. One write transaction commits the client action, checks the version and appends
   `notebook.note_forgetting`. From then on no tool or read reaches the note.
2. The cleanup deletes the key of every version record and every link record of the note, drops the
   note from the indexes, runs the [session cleanup](./context.md#forgetting-and-the-live-session)
   with the note's ID as its cause, and deletes the logged model requests from the note's first
   record on, because their tool results can hold its text. It then appends
   `notebook.note_forgotten`.

Every step is safe to run twice, so the server's start finishes a forget that a crash cut short. The
session cleanup runs for the conversation and for each open task whose tool list holds a notebook
tool. A link from another note to the forgotten one stays, and reads as gone in a walk and as
dangling in the check. A forget never reaches a `code.run` result or a file its program wrote. The
backup schedule counts `notebook.note_forgotten` as a forget record.

When the user forgets an item, a moment or a record that a note links to, the link stays and the
note's own text keeps whatever it quoted until the user forgets the note. The confirmation of a
record forget lists the active notes that link to the record, with a private note's title left out.

## The forget line

The notebook adds one entry to the [events block](../core/conversation-turns.md#the-events-block): a
line for each finished note forget, such as "Sam forgot note n4w8k2c6rd". The server registers it
only when the `forget_notices.note` setting is on, which is the default.
