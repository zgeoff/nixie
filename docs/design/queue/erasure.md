# One way to forget

- **Status:** agreed

You can forget a memory item, a moment, a note, a record, an image or the whole conversation, and
nixie forgets each of them through one erasure runner, as
[forgetting in the memory store](../../architecture/memory/store.md#forgetting) describes. This
design holds what is left: the vault and locked entries, which still need a kind of their own.

Once the owner approves this design, build its work items from it.

## Terms

- An **erasable** is one kind of thing a store can forget, such as a memory item or a note.
- An **erasure** is one forget of one target, from `erasure.started` to `erasure.finished`.
- An **evidence purge** re-keys a memory item that quotes a forgotten record, so the quote goes and
  the item's own text stays. It isn't an erasure.

## Contracts

### The vault and locked entries

- A vault entry's forget resolves any of its `vault.*` records to the entry, through the entry ID in
  the record, and never to its group. It erases the entry's page dumps, locked or not. The route
  asks for a passkey, as in the [vault design](accounts.md). The kind is `vault_entry`.
- A locked entry's forget, of the kind `locked_entry`, deletes every passkey wrapper and waits for
  an attempt to drop its unwrapped key.
- A vault lock, an unlock and a passkey wrapper's removal each make a backup due, beside
  `erasure.finished`.
- Each new kind joins the descriptors, so the generated list of forgettable kinds and the partition
  test cover it.

## Builder decides

- How the web client shows the backup state for kinds that show none today.

## Out of scope

- The wording of each forget's confirmation and its button.
- What each store keeps after a forget, such as a note's links from other notes.
