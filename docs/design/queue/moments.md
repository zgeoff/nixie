# Moments: the images in a moment's span

Some records in the span of a [moment](../../glossary.md) are messages of yours with images. In this
design, `moment.read` returns a pointer to each such image, and the agent opens an image with
`log.read_image` when it reads the moment. The memory export lists the same images. In the built
code, a moment shows a message with an image as its text alone.

Terms are in the [glossary](../../glossary.md). This doc adds 4:

- **A span** is the range of records that a moment refers to: one thread, a first sequence and a
  last sequence. A moment has one span.
- **A span record** is one record of a span, as `moment.read`, the moment view and the memory export
  return it.
- **A gap** is a span record whose text nixie cannot read, because a forget deleted the record's key
  or the key fails to decrypt. The record's place and its sequence remain.
- **An image pointer** is a span record's `eventID` with the number `n` of one image of that record.
  The agent passes both to `log.read_image`.

The sketches in `sketches/moments/` hold the types, the flows and the exact text of each refusal as
code, and this doc holds the rules. Each point that is not settled is marked here as
`(open: <name>)`, and [the open list](open/moments.md) holds it under that name, with its tracker
issue. The build of this design is slice 2 of [the slices](slices/moments.md), the list of pull
requests for the moments designs. Decision record [0037](../../decisions/0037-moments.md) holds the
choices behind moments.

"Built" describes the code as it stands. Every section after it describes the designed system.

Other docs own these contracts:

- A moment with several spans: [a moment across threads](moment-across-threads.md).
- A kept moment replayed as a check: [replay checks](moment-replay-checks.md).
- The removal of one span record: [redaction](redaction.md).
- Which memory tools and moment tools a task holds: [memory tools on a task](memory-task-tools.md).
- The short IDs in the records that the moment tools store: [short IDs](short-ids.md).

## Built

- `readMomentSpanPage` reads a span's records, a page at a time. `buildSpanEntry` builds each span
  record as a `MomentSpanEntry`, and renders a message of yours as its text alone.
- When one span record is larger than a page, `readMomentSpanPage` slices the record's text to fit
  and sets `isCut` on it.
- `moment.read` (`buildMomentReadTool`, `toEntryJSON`) returns each span record with `eventID`,
  which is the record's sequence as a string, and with its `payload`. It returns the payload of a
  gap too. Its output schema declares `records` as an array with no item shape.
- `moment.read` never checks the caller's thread, so a caller reads a moment of any thread.
- The payload of an `owner_message` record lists each image's media type (`images` in the message
  codec). The payload sits outside the erasable fields, so nixie reads it after a forget of the
  message.
- `log.read` renders each image of a message of yours as a `<dropped-image>` marker line in the
  message's text. nixie gives each marker a fresh random ID on every render.
- `log.read_image` takes `{ eventID, number }` and reads the caller's own thread. It refuses an
  image that the session's caps cannot take: 100 images and 24 MiB of base64 for one session
  (`sessionImageBudget`). The conversation holds `log.read_image` in its tool list.
- A message of yours takes up to 4 images of 5 MB each (`imageLimits`).
- `readMomentExport` reads each span through `readMomentSpanPage`, as `moment.read` does.
  `memoryExportSchemaVersion` is 6, and the export's span record is a strict object.

## A span record lists its images

The memory module owns the list, in `buildSpanEntry`. Usage:
[a read and an opened image](sketches/moments/01-usage.ts), section B. Shape:
[the span record](sketches/moments/02-types.ts), sections B and C. Flow:
[the image list](sketches/moments/03-flow.ts), section B.

- Each span record holds `images`. When the record is an `owner_message` that holds images, and the
  record is not a gap, `images` lists each image. For every other record, `images` is empty.
- An image's `n` is its place in the message, from 1. It is the `number` that `log.read_image`
  takes.
- When a message is a gap, its `images` list is empty. Its `payload` lists the media types, because
  `moment.read` returns the payload of a gap.
- When `readMomentSpanPage` cuts a span record, the record's `images` list is whole.
- `moment.read` returns an image's pointer in the `images` list, and never as a marker line in the
  text. A cut slices a record's text, and a marker's ID differs on every read, so a marker cannot
  point at an image.
- `buildSpanEntry` builds the list from the record alone and never from the caller. `moment.read`
  and the memory export both read through `buildSpanEntry`, so both return one list.
- The tool returns a `record` beside its result, which nixie stores in the log for the call. That
  record holds only IDs: the moment, its version, the reflections, the `eventID` of each span
  record, and the cursor. It holds no image list. An `eventID` and an `n` are not UUIDs, so
  [short IDs](short-ids.md) cover neither.

## The agent opens an image from a pointer

Shape: [the input, the limits and the refusals](sketches/moments/02-types.ts), section E. Flow:
[an opened image](sketches/moments/03-flow.ts), section C. Section E of the types sketch holds 2
refusals as constants: `imageUnavailable` and `imageUnavailableSessionFull`.

- `log.read_image` takes `{ eventID, number }` and reads only the caller's own thread. Whether it
  reads another thread for a moment's image is a choice that waits for you. (open: photo thread)
- When a moment sits on another thread than the caller's, `moment.read` lists the moment's images.
  `log.read_image` returns `imageUnavailable` for each of those pointers.
- `log.read_image` returns `imageUnavailable` in 3 more cases:
  - the message is a gap;
  - the record is not a message of yours;
  - the message holds fewer images than the number.
- `moment.read` spends none of the session's image caps. Each opened image counts against them.
- One session cannot always open every image of one message. 4 images of 5 MB come to about 26.7 MB
  of base64, which is more than the 24 MiB that a session takes. `log.read_image` returns
  `imageUnavailableSessionFull` for the image that passes a cap.
- In the description of `moment.read`, nixie tells the model to pass a record's `eventID` and an
  image's `n` to `log.read_image`, and that an image of another thread's moment is unavailable. The
  sentence itself is not written. (open: photo description sentences)
- The description of `log.read_image` lists `moment.read` beside `log.read` and `memory.recall` as a
  source of the number. Those words are not written either. (open: photo description sentences)

## The memory export lists the same images

Usage: [an export's span record](sketches/moments/01-usage.ts), section C. Shape:
[the export schema](sketches/moments/02-types.ts), section D.

- Each span record of the memory export holds the `images` list that `moment.read` returns.
- The export schema version is one above 6, the built version. The schema accepts a file of version
  6, which has no `images` field, and gives each span record an empty list.
- When images and [the removal mark](redaction.md#part-2-the-removal-mark) ship in one release, the
  version is 7 for `images` and `isRemoved` together. When they ship in separate releases, each
  raises the version by one.
- The client's `readMomentSpan` and the span record of the API contract hold no image list.

## How the image design is checked

- The acceptance checks never use a live model, and nobody sends a test turn to a production
  deployment.
- A scripted suite on a spawned nixie stands in for a live check. The test scripts the model's 2
  tool calls, and the turn's records show the `log.read_image` call with the status ok.
- You can check on a [preview](../../runbooks/preview.md) that a live model follows the descriptions
  of `moment.read` and `log.read_image`. That step is yours, and it gates nothing. When a model
  replies without the call, the code is not at fault. (open: photo preview command)

## Not in scope

- Image bytes in a moment record, a memory record or the export.
- An image shown inline in the client's moment view.
- A storage interface for images. The event log's attachments are the only store of the images.
