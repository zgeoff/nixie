# Redaction: you remove one record of a moment's span

A redaction removes one record of a span, such as a message that held a pasted secret. In the built
code, you forget one message or one reply of the conversation, and a moment shows the forgotten
record as a gap. This doc designs 3 parts beyond that: a redaction of a tool record, a mark that
separates a removed record from any other gap, and a removal control in the moment view. Which of
the 3 parts nixie builds is not decided. (open: redaction parts)

Terms are in the [glossary](../../glossary.md). This doc uses 3 more:

- **A gap** is a span record whose text nixie cannot read: [moments](moments.md).
- **A redaction** is the removal of one whole record, through the forget of a record. The forget of
  a record deletes the record's key: [a forget and a task's session](forget-and-task-sessions.md).
- **A removed record** is a gap that a forget made. Any other gap is a record whose key fails to
  decrypt, or a session summary whose key a session cleanup deleted.

The sketches in `sketches/moments/` hold the types, the flows and the exact texts as code, and this
doc holds the rules. Each point that is not settled is marked here as `(open: <name>)`, and
[the open list](open/moments.md) holds it under that name, with its options and its tracker issue.
Slices 3 to 6 of [the slices](slices/moments.md), the list of pull requests for the moments designs,
hold the choice of the parts and the build of each part.

"Built" describes the code as it stands. "The forget of a whole record" holds rules that are true of
the built forget and of the design alike. The 3 part sections describe the designed system.

## Built

- The `conversation.forget` checked action takes `{ clientActionID, thread, sequence }`. It writes
  `record.forget_started`, deletes the record's key, calls the session cleanup, and writes
  `record.forgotten` last. The functions are `writeRecordForget`, `writeForgetStart` and
  `runRecordForgetCleanup`.
- When a crash cuts a forget short, nixie finishes the forget at its next start. Each step is safe
  to run twice.
- `forgettableKinds` holds `owner_message` and `model.reply`. The forget returns `RECORD_NOT_FOUND`
  for a record of any other kind. The web client has a list of the same kinds in its record item
  component.
- A span holds tool calls and tool results beside messages and replies.
- `moment.read`, the moment view and the memory export show a forgotten record as a gap. One `isGap`
  covers a removed record and a record whose key fails to decrypt. 4 places set or declare it:
  `buildSpanEntry`, `toMomentSpanRecord`, the moment contract of the API contract package, and
  `spanRecordSchema` of the memory export.
- `isGap` is true when the record's erasable status is `shredded`, which means nixie deleted its
  key, or `unreadable`, which means its key fails to decrypt.
- The moment view words every gap with one sentence. Section G of
  [the types sketch](sketches/moments/02-types.ts) quotes it as `gapSentence`.
- Every session cleanup deletes the key of each session summary on the thread (`removeSummaryKeys`).
  The moment view and the export read every record kind of a span, session summaries included.
- The web client shows the forget control on a record of the conversation.
- A forget of a record never changes a memory item, even an item whose evidence quotes the record.

## The forget of a whole record

These rules hold for the built forget and for every part of the design. A redaction goes through the
`conversation.forget` action, because decision record [0037](../../decisions/0037-moments.md) allows
one forget path. The API module owns the forget and its 2 records, `record.forget_started` and
`record.forgotten`. Flow: [the forget](sketches/moments/03-flow.ts), section A.

- When you remove a record, nixie removes it from the whole conversation: from every moment whose
  span holds it, and from the thread itself.
- A redaction removes a whole record and never a part of one. One record has one key, and no field
  has a key of its own.
- A redaction touches only the record you name. A second record that repeats the text, such as a
  reply that quotes the secret, is as readable after the redaction as before it.
- The forget deletes the key before the session cleanup, so a rebuilt session reads the record as a
  gap.
- `conversation.forget` never removes a record that holds a moment's title, note or reflection, and
  never removes a record of a memory item. You remove a moment's text by destroying the moment. You
  remove an item's records by forgetting the item, which is the forget of the glossary.
- A redaction never reaches a model provider. A request that nixie sent to a provider before the
  redaction holds the text.
- The turn-input log is a planned log of what nixie sends to a model. Whether a redaction destroys a
  request in that log is a rule of that log's design, and not of this one.

Two points of the design wait for a choice:

- You redact, in the client. Whether the agent also redacts, through a tool, is open. (open:
  redaction actor)
- Whether a redaction also forgets a memory item whose evidence is the record is open. In the built
  code it never does. (open: redaction evidence items)

## Part 1: a redaction of a tool record

A secret can sit in a tool call or in a tool result, and the built forget refuses both. Usage:
[a removal](sketches/moments/01-usage.ts), section D. Shape:
[the forget's input and kinds](sketches/moments/02-types.ts), section F.

- `conversation.forget` takes `{ clientActionID, thread, sequence }`, and returns `RECORD_NOT_FOUND`
  for a record whose kind is outside `forgettableKinds`.
- `forgettableKinds` holds tool calls and tool results beside messages and replies. Which other
  kinds it holds is open. (open: redaction kinds)
- A tool record can sit on a task's thread. A task's session then holds the record's text. This part
  therefore depends on the design that cleans the session of a task whose setup holds
  `memory: 'none'`: [a forget and a task's session](forget-and-task-sessions.md).

## Part 2: the removal mark

The memory module owns the mark. Shape: [the removal mark](sketches/moments/02-types.ts), section G.
Flow: [the mark](sketches/moments/03-flow.ts), section D.

- Each span record of `moment.read`, of the client's `readMomentSpan` and of the memory export holds
  `isRemoved` beside `isGap`.
- `isRemoved` is true only for a record whose erasable status is `shredded` and whose sequence a
  `record.forget_started` record holds.
- `isGap` is true for every gap, a removed record included. A client built against the published
  contract without `isRemoved` therefore shows a gap. `isGap` remains a field of the contract for
  that client.
- When a record's status is `shredded` and a `record.forget_started` record with its sequence does
  not exist, `isRemoved` is false. A session cleanup deletes summary keys, so a deleted key alone
  never proves a removal.
- `buildSpanEntry` reads `record.forget_started` for the mark, and never `record.forgotten`. After a
  crash between the key's delete and the write of `record.forgotten`, the record is a gap and only
  `record.forget_started` holds its sequence.
- When a record's key fails to decrypt, `isGap` is true and `isRemoved` is false.
- The moment view words a removed record with the word "removed", and words any other gap with
  `gapSentence`. The full sentence for a removed record is not written. (open: removal sentence)
- The mark raises the export schema version by one. The schema accepts a file of the lower version,
  which has no `isRemoved` field, and gives each span record `isRemoved` false.
- The image list of [moments](moments.md#the-memory-export-lists-the-same-images) raises the version
  too. When both ship in one release, the version rises once for both.

## Part 3: the removal control in the moment view

Shape: [the preview read](sketches/moments/02-types.ts), section H. Flow:
[a removal from the moment view](sketches/moments/03-flow.ts), section E.

- The moment view shows the control `removalControlLabel` of section H on each span record of a kind
  that `conversation.forget` takes.
- The control sits behind a preview. The preview counts the moments whose spans hold the record and
  the memory items whose evidence quotes it. When the view reads the preview, and where it shows the
  counts, is not written. (open: preview order)
- The preview is one read procedure of the API, beside `conversation.forget`, with the input and the
  output of section H. Its name is open. (open: preview procedure name)
- When the preview read fails, the moment view hides the removal control. The view never removes
  without a preview, because decision record
  [0031](../../decisions/0031-memory-capture-context-and-removal.md) puts every removal behind one.

## Not in scope

- A key per field, and a removal of part of a record.
- A second forget action for moments.
- A storage interface for keys. The key store is the one place a key lives.
- The session cleanup of a task that reads no memory. It is a piece of work of its own, and nixie
  builds it whichever parts of this doc get built:
  [a forget and a task's session](forget-and-task-sessions.md).
