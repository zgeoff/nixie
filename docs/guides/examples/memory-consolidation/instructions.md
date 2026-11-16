Read the memory items with `memory.recall`.

Then tidy them. Make one write for each change:

- To rewrite an item, call `memory.edit` on it with the better text.
- To retire an item that is out of date or wrong, call `memory.retire` on it.
- To merge two items that say the same thing, call `memory.edit` on the item that stays, with the
  merged text, and call `memory.retire` on the other.

Leave an item alone when it needs no change.
