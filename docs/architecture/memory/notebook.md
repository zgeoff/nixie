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

The `notebook` section of the deployment config holds `note_chars`, the most characters of one body
(50,000), `max_notes`, the active notes, where a write past it is `NOTEBOOK_FULL`, and
`check_reason_repeats`, which defaults to 3 and makes the check report a reason only when more links
than that number repeat it. The default `notebook.max_notes` sits below the 1,000 notes of the first
design, because a start with that many full notes encoded for longer and held more memory than the
notebook's budget allows. The measurement and the budget sit in a comment beside the default in the
code. A deployment with more cores or shorter notes can raise the limit.

## The tools

The 10 tools are `notebook.write`, `edit`, `read`, `history`, `find`, `check`, `link`, `unlink`,
`walk` and `forget`. The 5 that change a note declare the `note` effect, so the starter rule
`allow-notes` allows them with no approval, and the other 5 declare `read`. Notes skip the memory
gate, which checks claims about the user, because a note is the assistant's own writing. The
conversation holds all 10, and a task holds one only when its tool list names it.

- An edit binds to the version it read, and the check and the record commit in one write
  transaction. An edit that sets only `append` binds to the current version at commit, so 2 tasks
  can append to one note. A link or an unlink never makes an edit stale.
- Every edit writes the whole new version, title and tags included, so reading any version decrypts
  one record, and nixie never rewrites a version. An edit that changes only the title, the tags or
  the private flag makes a new version, and an edit that sets no field is refused with
  `NOTHING_TO_CHANGE`. An edit applies its changes, then its append, and `NOTE_TOO_LONG` checks the
  result. Tags that match ignoring case merge into one, with the first spelling kept.
- `notebook.read` pages a long body so that each result fits the recall page limit, cutting at a
  paragraph break, then a line break, then a space. Every part repeats the title and the tags. Part
  1 alone carries the links and the backlinks, at most 25 of each, with `linkCount` and
  `backlinkCount` giving the totals, and `notebook.walk` reaches the rest. `notebook.read` reads
  `read_at` into its result, then appends `notebook.note_read` with the note's UUID alone, so
  `readAt` shows the read before this one. A refused read appends no record. Its `find` matches as
  `web_fetch` does: case-insensitive plain text over the body as stored, returning the part where
  the text first appears and up to 10 matches.
- `notebook.history` lists versions newest first, 50 a call. `notebook.find` returns at most 20
  notes a call: its words search matches any query word, its meaning search ranks a note by its best
  chunk above the floor of `memory.recall`, and reciprocal rank fusion merges the two. A walk stops
  at 200 nodes, or sooner when its result would pass the tool output limit, and sets `isCut`.
- `notebook.forget` takes a note's short ID and forgets the note for good, with no approval, because
  the notebook is the assistant's. It answers the short ID, the title, the status `forgetting` and a
  message that the note is hidden and its erasure finishes in the background, or `UNKNOWN_NOTE` for
  an ID that is unknown or was forgotten. It never answers that the note is forgotten, because the
  erasure can end only after the turn that called the tool. It takes no version and forgets the note
  as it stands. [Forgetting a note](#forgetting-a-note) covers what it erases.
- A note holds at most one link of each type to each target, and a second `notebook.link` with the
  same source, target and type replaces the reason. `PART_OF_CYCLE` checks the part-of links that
  exist when the link commits. A note ID written in a body is text: only `notebook.link` makes a
  link.
- A walk shows an event's time and role only for an event on the calling task run's own thread, when
  the run's tool list holds `log.read`, and an item's gist only when the list holds `memory.recall`.
  Otherwise the node holds the ID alone. The web client is the user's own view, so
  `notebook.readNote` shows every target's title or gist.
- A walk follows links both ways and visits each node once. It returns only references and labels,
  such as a title or a gist, with no note body and no full text of an item, a moment or a record. A
  target that was forgotten is listed as gone and the walk goes no further from it.
- The check is built when it is read. An orphan is an active note that holds no link and that no
  active note links to, and a note named only in another note's text counts as one. Two reasons are
  the same when they match after trimming, collapsing runs of spaces and ignoring case, and the
  check reports a related reason that more than `check_reason_repeats` links hold.

The call record of every notebook tool leaves out the free text of the call, and the result record
holds short IDs and versions only, with each UUID under `hidden.uuids`
([tool calls](../connectors/tool-calls.md#records)). A forget of a note therefore leaves no readable
copy of it in a tool's records.

## What memory sees of a note

The server hands memory an `ItemLinkCounts` that the notebook implements. Recall and per-turn
retrieval show `disputedBy` and `supersededBy` on an item: a count of active notes, private ones
included, above 0 only. A count holds no note ID and no title, and it falls when a note is unlinked
or forgotten. Memory never imports the notebook, and the root `turbo.json` denies the dependency.

Nothing that builds a turn's context reads a note's text, title or ID: per-turn retrieval, the
pinned core, the memory index, the session status and the compaction instruction. The notes' indexes
belong to the notebook, so a note never enters the item index, the trigger index or the moments'
vector index, and a note has no trigger phrases. `memory.recall` and `moment.read` never list the
notes that link to an item or a moment. The notebook adds no entry to the session status. A
retrieval test holds that nixie adds no note text and no note ID to the blocks it builds, even when
a message matches a note's title word for word. The one exception is the events block's line for a
note the user forgot, which names that note's short ID and nothing else, as
[the forget line](#the-forget-line) says. When `memory.remember` or `memory.edit` refuses with
`TEXT_TOO_LONG`, its message points the assistant at a note. The descriptions of `memory.edit` and
`memory.retire` say to keep an argument with an item in the notebook, linked with `supersedes` or
`disputes`.

`code.run` takes a note as an input file only when the caller's tool list holds `notebook.read`. The
[code tool](../connectors/code-tool.md#the-steps-of-a-call) owns the rule.

## Private notes

The flag changes nothing for the assistant: every tool reads and finds a private note as any other,
and `notebook.read` shows when the user last opened it. The web client's calls leave out a private
note, and every link to or from one, unless the call sets `showPrivate`, and the check is built over
every note before the private entries go, so a note that only a private note links never shows as an
orphan. The body stays out of `notebook.readNote`. Only the checked action `notebook.openPrivate`
returns it, with the version before it, and appends `notebook.private_opened`, so a refetch or a
retry never moves the mark. Opening a note that is not private writes nothing.
`notebook.previewForget` and the client's `notebook.forget` work on a private note without opening
it, and the `notebook.forget` tool forgets one as it forgets any other.

## Forgetting a note

The user forgets a note through the checked action `notebook.forget` in the web client, and the
assistant forgets one of its own with the `notebook.forget` tool. Both append the same records,
which differ only in who forgot. The client's call is in the
[API](../channels/api.md#forgetting-a-note). The forget runs in 2 parts, as a
[moment destroy](./moments.md#destroying-a-moment) does:

1. One write transaction commits the client action, checks the version and appends
   `erasure.started`, which records who forgot, `user` or `assistant`, and every key and session
   target of the forget. From then on no tool or read reaches the note. The tool has no client
   action and binds to no version.
2. The cleanup deletes the key of every version record and every link record of the note, drops the
   note from the indexes, runs the [session cleanup](./context.md#forgetting-and-the-live-session)
   with the note's ID as its cause, and deletes the logged model requests from the note's first
   record on, because their tool results can hold its text. It then appends `erasure.finished`. The
   erasure runner in `modules/log` runs the cleanup, and a forget that an earlier release began with
   `notebook.note_forgetting` finishes on the runner at the next start.

The session cleanup aborts every turn in flight and waits for each to end, as
[the live session](./context.md#forgetting-and-the-live-session) describes. The tool therefore never
waits for the cleanup: it runs part 1, answers `forgetting`, and starts part 2 beside the turn. Part
2 deletes the keys and drops the note from the indexes at once, and runs the session cleanup only
once the step that called the tool has committed, failed or lost its lease. The calling turn is
never aborted, so its messages get one answer. The notebook checks the step again after a short
wait. A cleanup that fails runs again after the same wait until it ends, through the same step that
the server's start runs for a note left `forgetting`. The next start finishes a cleanup that a stop
cut short.

Every step is safe to run twice, so the server's start finishes a forget that a crash cut short. The
session cleanup runs for the conversation and for each open task whose tool list holds a notebook
tool. A link from another note to the forgotten one stays, and reads as gone in a walk and as
dangling in the check. A forget never reaches a `code.run` result or a file its program wrote. The
backup schedule counts `erasure.finished` as a forget record, and `notebook.note_forgotten` for a
forget that an earlier release ended.

When the user forgets an item, a moment or a record that a note links to, the link stays and the
note's own text keeps whatever it quoted until the user or the assistant forgets the note. The
confirmation of a record forget lists the active notes that link to the record, with a private
note's title left out.

## The forget line

The notebook adds one entry to the [events block](../core/conversation-turns.md#the-events-block): a
line for each finished note forget by the user, such as "Sam forgot note n4w8k2c6rd". A forget by
the assistant adds no line, because it made the forget itself. The server registers the entry only
when the `forget_notices.note` setting is on, which is the default.
