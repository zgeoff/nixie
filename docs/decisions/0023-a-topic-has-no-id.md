# 0023: A memory topic has no ID

- Date: 2026-11-22
- Status: decided

## Decision

A memory item's topic is label text sealed under the item's own key, and nixie gives a topic no ID
and no hash in any record or table. nixie groups items by topic only after it opens their labels.
[The memory store](../architecture/memory/store.md#labels-and-the-revision) covers the labels.

## Why

- Forgetting an item deletes its key. With no topic ID or hash anywhere, nothing left on disk leads
  from the forgotten item to its topic, so the topic of a forgotten item is gone with its text.

## Rejected alternatives

| Option                                    | Why not                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| a topics table that items point at by ID  | A forgotten item's row still points at its topic, so the topic outlives it.    |
| a hash of the topic text beside each item | A hash of a short topic can be matched against guesses, so it leaks the topic. |

## Consequences

- Listing items by topic opens every item's labels, which the store holds in memory for this.
