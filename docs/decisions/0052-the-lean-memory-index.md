# 0052: The memory index, in its lean form

- Date: 2026-11-11
- Status: decided

## Decision

Memory reaches the agent through an index of labels at a session's opening, and the agent reads an
item in full by recall. An item's labels are its gist, its topic and its trigger phrases. These
choices keep the index small to build:

1. **A label edit takes the approval flow of every memory edit.** An edit that changes only labels
   is a proposal, after the hidden-character check and the token check.
2. **A label edit makes no item version.** It writes a label record, and a second counter counts
   label edits.
3. **No record of what the index showed.** nixie writes none.
4. **No measurement before the delete.** The index gets no offline measurement, and memory gets no
   second export. The per-turn similarity push is deleted directly after the switch to the index, in
   the same milestone, and `memory.rate` goes with it.
5. **The sensitive flag goes first.** The flag is removed before the index is built, and that
   migration drops its column.

## Why

- A gist opens every session, so a label reaches you as any other memory write does. No quote can
  back a label.
- "The model read this text" keys on the item version in 5 paths. A label record leaves each path as
  it is.
- The only reader of a record of what the index showed would be a measurement.
- An index built after the flag goes never grows a filter to delete later.
- The cost: a worse index is found in use, and the way back is a revert.

## Rejected alternatives

| Option                                               | Why not                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| a label-only edit applies at once                    | the saving is small, so label edits keep the flow that every memory write has                                            |
| a new item version for each label edit               | the 5 paths that mean "the model read this text" would change, and each edit would store another sealed copy of the text |
| a record with a sealed list of what the index showed | its one reader was the measurement                                                                                       |
| a measurement and a sign-off before the delete       | they need a second export of memory and a wait between the switch and the cleanup                                        |
| a dead column for one milestone                      | it leaves a column that nothing reads and a second migration to drop it                                                  |

## Consequences

- No rollback crosses the migration that drops the column. It is the one exception in
  [0049](0049-milestone-deploys-and-the-rollback-target.md).
- A tool passes one number for an item, which moves on a text edit and on a label edit.
- The missed-memory rating and the fix to the measurement's token counter are not built.
