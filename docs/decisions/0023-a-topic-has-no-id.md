# 0023: A memory topic has no ID

- Date: 2026-11-22
- Status: decided

## Decision

Each memory item has labels, and one of them is a topic, a short name that groups it with other
items. nixie stores the labels only encrypted, under a key that belongs to that item alone, and
never stores a topic ID or a hash of a topic in any record or table.
[Labels and the revision](../architecture/memory/store.md#labels-and-the-revision) covers the
labels.

## Why

- A topic ID would let nixie group items without decrypting them. nixie gives that up, because it
  forgets an item by deleting its key, which leaves its text and labels unreadable on disk. A topic
  ID or hash stored beside the item would stay readable after the key is gone, and would tell anyone
  with the disk which topic the forgotten item had.

## Rejected alternatives

| Option                                    | Why not                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| a topics table that items point at by ID  | The forgotten item's row keeps its topic ID after nixie deletes the key.                   |
| a hash of the topic text beside each item | The hash stays after nixie deletes the key, and anyone can hash likely topics to match it. |

## Consequences

- To group items by topic, nixie decrypts every item's labels. The memory store keeps the current
  labels of every item in the server's RAM for this, and drops an item's entry when a forget deletes
  its key.
