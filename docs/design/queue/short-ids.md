# Short IDs in place of UUIDs in tool records

nixie's rule is that the model reads and passes the short ID of a moment, a memory item or a
proposal, and never its UUID. [Short IDs](../../architecture/core/database.md#short-ids) gives the
reason. The code breaks the rule in one place: the `log.read` tool prints stored tool results back
to the model, and 8 memory tools store a UUID there. This doc holds the fix. Each of those tools
stores the short ID, and returns the UUID in `hidden`. `hidden` is an object that a tool returns
beside its result, which the tool runner stores in the result record and the model never reads.

The files in `sketches/web/` hold the TypeScript shapes, and a "Shape", "Flow" or "Usage" line
points at a lettered section of one of those files. The [glossary](../../glossary.md) holds the
terms that this doc does not define. A rule that ends with `(open: <name>)` is the intended design
and is not settled: [the open list](open/web.md) holds the item of that name, with its options and
its issue. The doc [What a tool entry of `log.read` shows](search-cost-records.md) owns the `hidden`
field and the rule for what `log.read` prints. The result shapes of these tools belong to
[memory recall](memory-recall.md), [the write gate](memory-write-gate.md) and
[the moment tools](moments.md).

This doc uses 3 names with care:

- **The result record** is the `tool_result` record that the tool runner writes to the event log.
- **The tool's `record`** is an optional object that a tool returns beside its result. When a tool
  returns one, the result record stores it under the key `result`, in place of the result.
- **A tool entry** is what `log.read` prints for one result record: its stored `result`.

## Built

The code on the main branch does this. Every section after this one is design.

- `createShortID` of the database lib makes a short ID. A moment row, a memory item row and a row of
  `memory_consolidation_changes` each hold one. The memory store reads an item's short ID through
  `readShortIDs`.
- 8 tools of the memory module put a UUID in the tool's `record`:

  | Tool             | Key that holds a UUID                     |
  | ---------------- | ----------------------------------------- |
  | `moment.find`    | `momentID` of each entry of `moments`     |
  | `moment.read`    | `momentID`                                |
  | `moment.keep`    | `momentID`                                |
  | `moment.edit`    | `momentID`                                |
  | `moment.retire`  | `momentID`                                |
  | `moment.link`    | `momentID` and `itemID`                   |
  | `memory.recall`  | `itemID` of each item                     |
  | `memory.pending` | `proposalID` of each entry of `proposals` |

- The result of each tool of the table, except `memory.pending`, shows the short ID under the same
  key.
- The result of `memory.pending` shows the proposal's UUID as `proposalID`, as its `record` does. A
  proposal's ID comes from `crypto.randomUUID()`, and a proposal row holds no short ID. The results
  of `memory.remember`, `memory.edit`, `memory.retire` and `memory.pin` show a proposal's UUID as
  `proposalID` too.
- `memory.diff` puts a UUID in its `record` too, under `changeID` of each change. It is a tool of
  the built-in consolidator. The memory family of this design folder deletes that consolidator, so
  this doc gives `memory.diff` no rule for its `record`.
- A moment tool takes a UUID or a short ID as its `momentID` input.
- nixie can destroy a moment, which is not the same as retiring it. A destroyed moment has no row.

## What the 7 moment and recall tools store

The 7 tools are the tools of the table in [Built](#built), except `memory.pending`. Shape:
[the `hidden.uuids` object and the keys of each tool](sketches/web/02-types.ts), section N. Usage:
[a moment tool's outcome](sketches/web/01-usage.ts), section I.

- In the tool's `record`, each of the 7 tools puts the short ID under each key that the table gives
  for it. Its result shows the same short ID under the same key.
- Each of the 7 tools returns `hidden` beside its `record`. `hidden.uuids` maps each short ID that
  the tool put under a key of the table to its UUID.
- `hidden` holds the UUIDs alone. A tool never puts text in `hidden` that a forget of another record
  must erase.
- The input schema, the result and the output schema of the 7 tools are the same as on the main
  branch.
- A tool entry of one of the 7 tools shows the model the same content as on the main branch, with
  each UUID replaced by its short ID.
- Server code that needs a UUID that one of these tools stored reads it from `hidden.uuids` of the
  result record, never from the stored `result`. (open: stored uuid readers)
- The web client shows you the whole result record, the UUIDs included.

## What `memory.pending` stores

- The result and the `record` of `memory.pending` show a short ID as `proposalID`, and
  `hidden.uuids` maps it to the UUID.
- Where a proposal's short ID comes from waits for your decision. The same decision covers the
  `proposalID` in the results of `memory.remember`, `memory.edit`, `memory.retire` and `memory.pin`.
  (open: proposal short id)

## A result record that holds a UUID

A log can hold result records that the 8 tools and `memory.diff` wrote with a UUID in the stored
`result`. `log.read` never prints such a UUID. The whole section is the intended design of one open
item, (open: stored uuid rule), and 2 of its bullets rest on a second item each. Flow:
[a tool entry's text](sketches/web/03-flow.ts), section I. Usage:
[a stored result with a UUID](sketches/web/01-usage.ts), section I.

- `log.read` looks at 3 keys at any depth of the stored `result`: `momentID`, `itemID` and
  `changeID`. When the value of one has the shape of a UUID, `log.read` prints the short ID in its
  place.
- `log.read` reads the short ID from the row of the moment, the item or the change. It applies the
  swap to every result record, whatever tool wrote it.
- When the row holds no short ID or does not exist, `log.read` omits the key. (open: omitted entry)
- A destroyed moment has no row, so a result record of one prints without its `momentID`.
- When the read of a short ID fails, such as on a closed database, the `log.read` call fails as any
  read error does. It never prints the UUID.
- A stored `result` that holds short IDs has no value with the shape of a UUID, so `log.read` reads
  no row for it.
- A stored `memory.diff` result prints the short ID of each change while the row of the change
  exists, and no `changeID` when it does not. (open: change rows)
- What `log.read` prints for a stored `proposalID` that is a UUID follows your decision on a
  proposal's short ID. (open: proposal short id)

## Not in scope

- A `record` with short IDs for `memory.diff`.
- The `momentID` input of a moment tool, which takes a UUID or a short ID.
- The cost of a web search, which is another use of `hidden`:
  [What a tool entry of `log.read` shows](search-cost-records.md).
- The `record` of any other tool.
