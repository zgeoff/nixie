# Memory export

The memory export writes every memory item, with its whole history, into one JSON file that the user
saves where they pick. The file holds a header and then each item in the order it was created. An
active or retired item carries its subject, owner, shared or [self](./writes.md#self-notes), and
every version, oldest first, with its text, the quote it was saved from and its provenance. A
forgotten item carries only its ID and the time its forget completed, so the file never holds a
forgotten item's words. The [moments](./moments.md) follow the items, each with its span's text
decrypted, and a destroyed moment carries only its ID and the time its destroy completed. Only the
user exports: the model's export tool is denied, and nixie never sends the file anywhere but the
device that asked.

[The memory store](./store.md) covers the items, versions and states the export reads, and
[the memory view](./view.md) covers the page the export button sits on.

## The file

The export schema, versioned beside the memory store's code, fixes the file's shape, and a committed
fixture of each version shows a whole file. The header holds the export time, the schema version and
the snapshot hash of the definitions in force when the export ran, so a reader checks the version
before it reads the items. Each version also keeps the snapshot hash it was written under, because a
version's checks only make sense against the definitions that ran them. A change to the shape raises
the schema version, so a file from an older release holds the version of the shape it was written
in.

A version whose key or ciphertext fails exports with no text and no quote, as the memory view shows
it unreadable. An item a forget began exports as a forgotten one even before the forget's cleanup
removes its key, and its forget time stays empty until the forget completes. The quote's message is
not part of the file: the file holds memory, and the message stays in the event log.

## Streaming

The memory store reads the file a page of items at a time and hands it on as text, the header first,
so neither the store nor the API ever holds the whole file. The API streams that text to the device
as server-sent events, one chunk per item, then one event that marks the file complete. A stream can
end cleanly before the file does, so the device keeps a file only after that event. The items are
read page by page, so an item created during an export lands in the file only when its page has not
been read yet.

## The checked action

The export is a checked action ([checked actions](../channels/api.md#checked-actions)) with no input
beyond its client action ID. The API checks that the caller's session is still live and commits the
action's record, with the export time, the schema version and the snapshot hash, before the file
starts to stream, so every export that streamed leaves a record. A retry with the same client action
ID streams the file again, as it reads at the retry, because a stream cut short leaves the device
with no file. An ID that another action used is refused.

## Saving the file

The web client asks where the file goes before the export starts, while the click still counts as
the user's, through the browser's save picker, and writes each chunk to that file as it arrives. A
stream that fails, or ends before the completion event, aborts the write and shows an error, so a
failed export leaves no partial file, and the next try keeps the same client action ID. A browser
with no save picker gathers the file and offers it as a download, which the browser saves where its
settings say.

## The model's export tool

The model's tools include `memory.export`, which declares the `export` effect. The fixed read-only
rule denies every effect but read, fetch and note, so a model call to it is refused before it runs.
The tool takes no destination, so a call that a later rule lets through still exports nothing, and
its result is a sentence for the model: the user exports from the memory view.
