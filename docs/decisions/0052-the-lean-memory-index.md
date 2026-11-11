# 0052: The memory index, in its lean form

- Date: 2026-11-11
- Status: decided
- Design: [the memory index](../design/queue/memory-index.md)

Memory reaches the agent through an index of labels, and the agent reads an item in full by recall
(GEO-2364). An item's labels are its gist, its topic and its triggers. These choices keep the index
small to build:

1. **A label edit takes the approval flow of every memory edit.** No quote can back a label, so an
   edit that changes only labels is a proposal, after the hidden-character check and the token
   check.
2. **A label edit makes no item version.** It writes a label record, and a second counter counts
   label edits.
3. **No record of what the index showed.** nixie writes none.
4. **No measurement before the delete.** The index gets no offline measurement, and memory gets no
   second export. The old per-turn similarity push is deleted directly after the switch to the
   index, in the same milestone. `memory.rate` goes with that cleanup, and the missed-memory rating
   and the fix to the measurement's token counter are canceled.
5. **The sensitive flag goes first.** The flag is removed before the index is built, and that
   migration drops its column (GEO-2363).

## Why

- A gist opens every session, so a label reaches you as any other memory write does.
- "The model read this text" keys on the item version in 5 paths. A label record leaves each path as
  it is.
- An index built after the flag goes never grows a filter to delete later.
- The cost: a worse index is found in use, and the way back is a revert.

## Alternatives

- **A label-only edit applies at once.** Labels are short, and it would save you the approval of
  each one. The gain is small, so label edits keep the flow that every memory write has.
- **A new item version for each label edit.** The 5 paths that mean "the model read this text" would
  change, and each label edit would store another sealed copy of the text.
- **A record with a sealed list of what the index showed.** Its one reader was the measurement.
- **A measurement and a sign-off before the delete.** They find a worse index before you use it, and
  they need a second export of memory and a wait between the switch and the cleanup.
- **A dead column for one milestone.** It keeps the rollback, and it leaves a column that nothing
  reads and a second migration to drop it.

## Consequences

- No rollback crosses the migration that drops the column, the one exception in
  [0049](0049-milestone-deploys-and-the-rollback-target.md).
- A tool passes one number for an item, which moves on a text edit and on a label edit.
