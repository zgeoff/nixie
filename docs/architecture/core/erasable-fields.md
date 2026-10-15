# Erasable fields

nixie forgets text by destroying keys, never by rewriting the log. Every free-text field of a
record, such as message text, tool arguments or a tool result, sits in the record's erasable fields,
encrypted under a key that belongs to that record alone. The keys live in a key store, a SQLite file
of their own beside the database. Deleting a record's key leaves the record in the log with its
envelope and payload, and its text unreadable in every copy of the database that exists, backups
included. This is crypto-shredding, chosen for memory in
[0010](../../decisions/0010-memory-store.md). [The event log](./event-log.md) covers the record the
fields belong to.

## Keys

Each record with erasable fields gets a fresh AES-256-GCM key under a random key ID. The deployment
key wraps it with AES-KW before it reaches the key store, so the key store alone decrypts nothing.
The record's fields are encrypted with the key ID bound in as additional data, so a ciphertext
copied onto another record fails to decrypt. A record with no free text and no attachments gets no
key.

An attachment is a block of bytes that belongs to a record, such as an image the user sends with a
message. Its bytes are too large for the erasable fields, so they sit in an attachments table of
their own, keyed by the record's sequence and the attachment's position, and sealed under the
record's own key. The key ID and the position are bound in as additional data, so an attachment
copied onto another record, or moved to another position, fails to decrypt. The table is append-only
like the log, and a forget leaves its rows in place, unreadable with the record's text. The payload
holds only what describes an attachment, such as an image's media type, and never its bytes.

The payload never holds free text, and no projection reads the erasable fields. One kind of value in
a payload is ciphertext and not free text: a memory version's text, sealed under its item's key,
which the [memory store](../memory/store.md#items-and-versions) folds into its versions table. A
forget destroys that key, so the payload's copy is unreadable with every other copy. A projection
rebuilt after a forget therefore gives the same rows as before, and nothing outside the erasable
fields keeps a copy of the text. The database holds no full-text index over erasable fields for the
same reason: an index would keep the plaintext after its key is gone.

## The key store

The key store is `keys.db`, beside `nixie.db` in the data directory. A database backup then holds
only ciphertext, and a key deleted from the key store never returns with a restore of the database.
The key store overwrites deleted content in place, so a deleted key leaves nothing in the file's
free pages. It has no migrations, because the copy nixie takes before a migration would keep every
key deleted after it. Every ID that keys the key store is random, never a sequence
([key store IDs](./database.md#key-store-ids)).

## Forgetting a record

Removing a key checks the writer epoch first, so a process that lost the writer role deletes
nothing. It then deletes the key and checkpoints the key store, so neither the file nor its
write-ahead log holds the wrapped key afterwards. A connection that holds a read on the key store
blocks the checkpoint, and the removal then fails until a retry finishes the checkpoint, rather than
report a key gone that still sits in the log file.

A record whose key is gone reads as shredded, with its envelope and payload intact. A record whose
key fails to unwrap, such as one wrapped by another deployment's key, or whose ciphertext fails to
decrypt, reads as unreadable. Neither case stops a reader that follows the log.
