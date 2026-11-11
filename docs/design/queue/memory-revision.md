# The revision of a memory item

This doc covers the numbers that count the changes to a memory item, and which number each tool,
record and function uses. The design has 2 stored counts and one computed number, the revision. They
exist for one case. When you approve a label-only edit, a caller that read the item before the edit
must get a stale error. Yet nixie must not treat the item's text as changed, because then it would
send the text again to a session that has it.
[Decision 0052](../../decisions/0052-the-lean-memory-index.md) records the choice.

"Built" states what the code does. Every section after it states the design, which is not built. The
sketches in `sketches/memory-index/` hold the shapes, and this doc holds the rules. Terms are in the
[glossary](../../glossary.md). [The labels of a memory item](memory-labels.md) defines the labels, a
label-only edit, the item label record (`memory.labelled`) and the proposal label record
(`memory.proposal_labelled`). Open items are in [the open list](open/memory-index.md), each marked
here as `(open: <name>)`.

## Built

- An item has one number, its version, in the column `version` of `memory_items`. A
  `memory.version_added` record adds 1 to it.
- Every tool input and output, every record, the memory view, the API and the export use that
  number.
- `requireItem` is the stale check. It compares the number a caller passes with the item's version
  and throws `StaleVersionError` when they differ.
- 5 readers take the version to mean "the model read this text": the replay that works out which
  item texts a session has, the list of items a search of a turn skips, the note for a changed
  pinned item, ratings, and the export.

## The 3 numbers

Shape: [the 2 columns](sketches/memory-index/02-types.ts), section D.

- **The text version** is the number in the column `version`. A `memory.version_added` record adds 1
  to it. It identifies one text of the item. Every reader that asks "did the model read this text"
  uses it.
- **The label edit count** is the number in the column `label_edits`. It starts at 0. nixie writes a
  `memory.labelled` record whose `change` is `edited` when you approve a label-only edit, and that
  record adds 1 to the count.
- **The revision** is the text version plus the label edit count. The store computes the revision on
  each read and never stores it, so a stored revision can never be out of date.
- A text edit and an approved label-only edit each move the revision by 1.
- nixie never writes a text version for a label edit. If it did, it would send the item's text again
  to a session that has it, and store a second encrypted copy of the same text.
- `label_edits` has a default of 0. After a rollback of nixie to a release that predates the column,
  that release inserts item rows without a value for it, and each such row gets 0.

## Where the revision turns into the text version

Flow: [the stale check](sketches/memory-index/03-flow.ts), section A.

- A memory tool takes and returns the revision, in the member `version`.
- `requireItem` compares the number it is given with the item's revision. It is the only stale check
  on a tool call or an API call that targets an item. It returns the item's row.
- Every step after `requireItem` reads the text version from that row's `version`.
- Every record the store writes holds the text version. 2 record kinds also hold a revision:
  `memory.labelled` and `memory.proposal_labelled`.
- When the number a tool call passes is not the item's revision, nixie returns the stale-version
  error with the item's revision in it. A text edit and a label-only edit by another caller both
  cause it.

## What uses the revision

| Place                                                               | Code                             |
| ------------------------------------------------------------------- | -------------------------------- |
| `version` in the output of `memory.recall`                          | `buildRecallTool`                |
| The `vN` on a memory line                                           | `renderMemoryLine`               |
| The memory view, its API and the web client's mocks of that API     | the memory view procedures       |
| The number in the stale-version error                               | `StaleVersionError`              |
| `version` in the input of `memory.edit`, `retire`, `pin`, `unpin`   | `requireItem`                    |
| The target of a forget or a lapse from the API                      | `requireItem`                    |
| `revision` in `memory.labelled`                                     | the label writer                 |
| `targetRevision` in `memory.proposal_labelled`                      | `createSealedProposal`           |
| The column `target_revision` of the proposals projection            | `memoryProposalsProjection`      |
| `version` of an edit proposal in `memory.pending`                   | `buildPendingTool`               |
| `version` of an edit proposal in the proposal procedures of the API | `createMemoryProposalProcedures` |
| The same, in the host API                                           | `createHostProposalProcedures`   |
| The next number that a change procedure returns                     | `createMemoryChangeProcedures`   |
| The same, in the notice procedures                                  | `createMemoryNoticeProcedures`   |
| `revision` on each label row of a recall with `includeHistory`      | `buildRecallTool`                |

- The `version` of an edit proposal is its `targetRevision` when the proposal has one. For a
  proposal with no proposal label record, it is `targetVersion` plus the item's label edit count at
  the read. That sum is the item's revision exactly when the proposal is not stale. Only a proposal
  that a release from before the labels wrote has no proposal label record.
- A change procedure of the API returns the number the item has after the change: the revision
  plus 1. One call moves the revision by 1, whether it changes the text, the labels or both.

## What uses the text version

| Place                                                         | Code                                       |
| ------------------------------------------------------------- | ------------------------------------------ |
| `memory.recalled`, and the item refs on the turn-ended record | `readRecall`                               |
| The replay of what a session has, and the items a push skips  | the sessions module                        |
| The export                                                    | `memoryExportSchema`                       |
| The retirement gate's check that the thread recalled the text | `runIntentGate`                            |
| The read of an item's text before a pin or a retire           | `readItemText`                             |
| The pin record that the gate writes, and the unpin record     | `writeGatedPin`                            |
| The pin record that an approval writes                        | `writeApprovedPin`                         |
| `memory.forget_started`                                       | `runForget`, `runForgetItems`              |
| A proposal's `targetVersion`                                  | `createSealedProposal`                     |
| The proposal hash                                             | `buildProposalHash`                        |
| The duplicate check                                           | `readMatchingProposal`                     |
| The read and the write of one version of an item's text       | `readVersion`, `writeVersionInTransaction` |
| The items that a delivery can place                           | `readDeliverableItems`                     |
| `targetVersion` in the proposals projection and its read      | `readPendingProposals`                     |
| `version` beside `revision` in `memory.labelled`              | the label writer                           |
| `textVersion` on each text of a recall with `includeHistory`  | `buildRecallTool`                          |

- `createMemoryForgetProcedures` takes the revision from the API and passes it through
  `requireItem`, and the forget record holds the text version.
- A [moment](../../glossary.md) has a version of its own, which is none of an item's 3 numbers.
  These rules do not cover it.
- The 2 tables may miss a reader of an item's version: the check that they are whole is not done.
  (open: path table)

## The approval of a proposal

Flow: [the approval](sketches/memory-index/03-flow.ts), section D.

- For a proposal with a proposal label record whose `targetRevision` is a number, your approval is
  stale when `targetRevision` is not the item's revision.
- For a proposal that creates an item, `targetRevision` is `null`, and nixie runs no stale check.
- For a proposal with no proposal label record, your approval is stale when `targetVersion` is not
  the item's text version.
- nixie refuses a stale approval and writes nothing. The item has the text and the labels from the
  change that made the approval stale. The proposal waits until you reject it or it lapses.
- A text proposal with labels targets a revision. When you approve a label-only proposal for the
  same item first, the revision moves, and nixie refuses your approval of the text proposal as
  stale.

## The tools after a label-only edit

- When a `memory.retire` follows a label-only edit, the call passes the item's revision. The
  retirement gate compares the item's text version with `memory.recalled`. So a text that the thread
  recalled before the label edit counts as read.
- A `memory.pin`, a `memory.unpin` and a forget after a label-only edit each succeed with the
  revision that a recall after the edit shows, and each record holds the text version.
- A caller that holds the number from before the label-only edit gets the stale-version error once,
  and reads the item's revision from it.
- After a label-only edit, nixie never sends the item's text to a session that has it, and never
  writes a change note for a pinned item.

## Not in scope

- A revision column. The store computes the revision.
- A revision for a moment.
- A change to what `memory.recalled` means. It means "the model read this item's text".
