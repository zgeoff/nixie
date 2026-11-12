# 0010: Forget is crypto-shredding

- Date: 2026-10-08
- Updated: 2026-10-10
- Status: decided

## Decision

Forgetting is crypto-shredding. nixie encrypts each memory item with its own key, and forgetting
deletes the key. A forget stays pending until local cleanup finishes and every registered backup
drops its copies of the key. It reports completion only when the item is unreadable across that
scope. A model provider that already received the text in a turn sits outside that scope.

## Why

- Crypto-shredding makes a forget reach backups.

## Rejected alternatives

| Option                     | Why not                                            |
| -------------------------- | -------------------------------------------------- |
| deleting the row to forget | Older backups keep the item until they rotate out. |

## Consequences

- nixie manages a key per memory item, and a replay shows a gap where a forgotten item was.
- The same crypto-shredding can cover other erasable fields in the event log, such as a contact's
  details.

## Changes

- 2026-10-10: a forget stays pending until every registered backup drops its copies of the key. The
  first version reported an item unreadable everywhere once its key was deleted.
