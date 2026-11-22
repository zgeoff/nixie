# 0007: Forget is crypto-shredding

- Date: 2026-10-08
- Updated: 2026-11-22
- Status: decided

## Decision

Forgetting is crypto-shredding. nixie encrypts each memory item with its own family of keys, and
forgetting the item deletes every key in the family. The
[evidence purge](../architecture/memory/store.md#the-evidence-purge) deletes only the keys of an
item's older versions and its quotes of a forgotten record, so the item's current text stays
readable. A forget stays pending until local cleanup finishes and every registered backup drops its
copies of the keys. It reports completion only when the item is unreadable across that scope. A
model provider that already received the text in a turn sits outside that scope.

## Why

- Crypto-shredding makes a forget reach backups.
- A backup copied before a forget still holds the item's keys, so the forget is complete only once
  nixie can delete every copy of them.

## Rejected alternatives

| Option                                                                                  | Why not                                                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| deleting the row to forget                                                              | Older backups keep the item until they rotate out.                            |
| key backups on storage with immutable retention, or with versions nixie does not manage | nixie cannot delete a past copy of a key, so a forgotten item stays readable. |

## Consequences

- nixie manages a family of keys per memory item, and a replay shows a gap where a forgotten item
  was.
- The same crypto-shredding can cover other erasable fields in the event log, such as a contact's
  details.
- The storage that holds key backups must let nixie delete every past copy, so it cannot use object
  lock, immutable retention or versioning that nixie does not manage
  ([a forget and the key backups](../architecture/memory/store.md#a-forget-and-the-key-backups)).

## Changes

- 2026-10-10: a forget stays pending until every registered backup drops its copies of the key. The
  first version reported an item unreadable everywhere once its key was deleted.
- 2026-11-13: each memory item has a family of keys, and the evidence purge deletes part of the
  family. The first version gave each item one key.
- 2026-11-22: the storage for key backups must let nixie delete every past copy.
