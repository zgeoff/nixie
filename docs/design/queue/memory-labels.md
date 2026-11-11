# The labels of a memory item

Every memory item holds 3 labels that the agent writes: a gist, a topic and trigger phrases. This
doc covers the labels, the tools that write and show them, and the 2 records that store them. The
section "The sensitive flag" covers a mark that the built code holds on an item to hide its text
from recall and from a turn. The designed system does not have it. The labels exist so that
[the memory index](memory-index.md) can list an item in one line and
[trigger push](memory-turn-push.md) can bring it to a turn.
[Decision 0052](../../decisions/0052-the-lean-memory-index.md) records the choices.

"Built" states what the code does. Every section after it states the design, which is not built. The
sketches in `sketches/memory-index/` hold the shapes and the exact texts, and this doc holds the
rules. Terms are in the [glossary](../../glossary.md). Open items are in
[the open list](open/memory-index.md), each marked here as `(open: <name>)`. The work is in
[the slices](slices/memory-index.md).

Terms of this doc:

- **gist:** one line on what an item is about.
- **topic:** a short name that groups items, such as `home` or `work/standups`.
- **trigger phrase:** a phrase you would say when an item matters. The tools call the list
  `triggers`. A [trigger](../../glossary.md) alone means what starts a job run.
- **labels:** an item's gist, topic and trigger phrases, as one set.
- **label-only edit:** a `memory.edit` call that passes no `text`.
- **text version:** the count of an item's texts.
- **revision:** the count of every change to an item, its label-only edits included. Every memory
  tool shows the revision as `version`. [The revision of a memory item](memory-revision.md) owns
  both numbers.
- **seal:** encrypt under the item's own key. To [forget](../../glossary.md) an item is to delete
  that key.

## Built

- `memory.remember` requires only `text`. `memory.edit` requires `itemID`, `version` and `text`.
- nixie parses the version record (`memory.version_added`) and the proposal record
  (`memory.proposed`) with schemas that refuse an extra key. `parseMemoryRecord` returns nothing for
  a record kind it does not know.
- A change of an item's [subject](../../glossary.md) is a record of its own, of the kind
  `memory.subject_changed`, so that a release without that kind skips the record.
- `buildProposalHash` hashes a pending proposal. `readMatchingProposal` finds a duplicate pending
  proposal by the operation, the item, the target version and the text.
- The store holds an in-memory item index (`MemoryIndex`) that it rebuilds at each start. A forget
  removes the item's entries from it and deletes the item's key.
- The sensitive flag exists as 2 record kinds (`memory.sensitive_marked` and
  `memory.proposal_sensitive_noted`, read by `parseSensitiveRecord`), a column `is_sensitive` on
  `memory_items` and `memory_proposals`, an input of `buildProposalHash`, the tool
  `memory.mark_sensitive`, the API procedure `markSensitive`, a review toggle in the web client, and
  2 `isSensitive` fields in the published API contract.
- `readRecall` can omit marked items, and `readTurnRetrieval` asks it to.
- `memoryExportSchema` requires `isSensitive` at schema version 6.
- `pickSensitiveReview` holds a write to a marked item with the review reason `sensitive`. The
  reason is in `reviewReasons`, with a sentence in `renderReviewReason`, a value in the API's
  `reason` list and a label in the web client. `toReviewReason` reads a reason it does not know as
  `other`.

## The 3 labels

- Every item has a gist and a topic, whatever its [subject](../../glossary.md). A self-note has
  both, because the index lists self-notes by topic.
- An item has 0 to 5 trigger phrases. Trigger push never places an item with none.
- Each label is one line. A gist has 1 to 80 characters, a topic 1 to 40 and a trigger phrase 1
  to 60. Shape: [the label bounds](sketches/memory-index/02-types.ts), section A.
- The agent writes the labels through `memory.remember` and `memory.edit`. It reuses a topic that
  exists when one fits, and creates a topic without asking when none fits.
- The descriptions of the 2 tools explain the 3 labels to the agent. Text:
  [what the descriptions say](sketches/memory-index/02-types.ts), section P.
- nixie seals a topic as text on each item, and gives a topic no ID and no hash in any record. A
  forget must make an item's topic unreadable, and a plain ID or hash on the item's records would
  show which topic the forgotten item had.
- When an item's subject changes, nixie writes no label record, and the item's labels are the ones
  it had.

## Labels in the write tools

Usage: [a remember and 2 edits](sketches/memory-index/01-usage.ts), sections A and B. Shape:
[the 2 inputs and the output](sketches/memory-index/02-types.ts), section B.

- `memory.remember` requires `text`, `gist` and `topic`. `text` has 1 to 2,000 characters. When a
  call omits `gist` or `topic`, the tool returns an error. (open: error texts)
- `memory.edit` requires `itemID` and `version`. It takes `text`, `gist`, `topic` and `triggers` as
  optional. When a call passes none of those 4, the tool returns an error. (open: error texts)
- In `memory.edit`, `triggers` replaces the whole list, and `[]` clears it. A label that the call
  omits has the value it had.
- `memory.edit` takes `quote`, `eventID`, `until` and `subject` only beside `text`. The tool refuses
  a label-only edit that passes one of them. (open: error texts)
- The `version` that `memory.edit` takes, and the `version` that both tools return, is the item's
  revision.
- The write gate holds every label-only edit as a proposal, for every caller.
  [The write gate's checks on labels](memory-write-gate-labels.md) owns that rule, the checks and
  the review reason.
- The conversation holds both tools. Which task holds them is in
  [the memory write tools on a task](memory-task-tools.md).

## Labels in `memory.pending` and `memory.recall`

- The input of `memory.pending` has no label member. Each proposal that has a proposal label record
  shows its `gist`, `topic` and `triggers`. A label-only proposal shows `isLabelOnly: true` and no
  text of its own. Shape: [labels in a pending proposal](sketches/memory-index/02-types.ts), section
  C.
- `memory.recall` returns `gist`, `topic` and `triggers` on each item. The agent reads the list of
  trigger phrases there before an edit replaces it. [memory.recall](memory-recall.md) owns the tool.

## The item label record

nixie stores an item's labels in a record of the kind `memory.labelled`. Shape:
[the item label record](sketches/memory-index/02-types.ts), section E. Flow:
[the one writer](sketches/memory-index/03-flow.ts), section B.

- The record always holds the whole label set, and never only the labels that changed.
- nixie seals the label set. The sealed value has a name that no other sealed value of the item
  shares: `labels/<itemID>/<revision>`.
- nixie parses the record with a schema that accepts an extra key.
- The record's `change` has one of 3 values:
  - `written`: nixie writes the record in the commit of a `memory.version_added`. The record's
    `revision` is that version's revision.
  - `edited`: nixie writes the record when you approve a label-only edit. nixie writes no version
    with it, and the item's revision moves by 1.
  - `backfilled`: nixie's own code labels an item that has no label record, with no proposal. The
    record holds the item's revision at that moment, and the revision does not move.
    [Slice 2](slices/memory-index.md) gives the items that get such a record and their labels.
- The record's `origin` is who made the write, with the values the version record uses. The value
  `memory_writer` is the built-in note-taker's. A label record holds it only when you approve a
  proposal whose `memory.proposed` record holds it.
- One function writes the record for every path: a remember, an edit, an approval and the backfill.
  The same function updates the item's gist, topic and trigger entries in the store's in-memory item
  index.

## The proposal label record

A proposal that carries labels has a record of the kind `memory.proposal_labelled` beside its
`memory.proposed` record, in one commit. `memory.proposed` has no label member. Shape:
[the proposal label record](sketches/memory-index/02-types.ts), section F. Flow:
[the duplicate check, the hash and the approval](sketches/memory-index/03-flow.ts), sections C and
D.

- The record holds the whole label set that the approval applies, sealed, under the name
  `proposal-labels/<proposalID>`.
- The record holds `targetRevision`: the revision the caller read. It is `null` for a proposal that
  creates an item. `memory.proposed` holds `targetVersion`, the text version.
- nixie creates the ID and the key of an item when it writes the proposal that creates the item. So
  nixie seals that proposal's labels under the key the item has once you approve.
- The `memory.proposed` record of a label-only proposal holds the operation `remember`, the item's
  text version as `targetVersion` and a copy of the item's text. `memory.proposed` has no operation
  for a label edit. After a rollback, a release from before the labels meets the record and must
  parse it. [Slice 2](slices/memory-index.md) gives what that release does with the proposal.
- When you approve a label-only proposal, nixie writes one `memory.labelled` record with exactly the
  labels you reviewed, and no version.
- `buildProposalHash` hashes the labels, `targetRevision` and `isLabelOnly` only for a proposal that
  has a proposal label record.
- `readMatchingProposal` compares labels. A proposal that carries labels matches a pending one only
  when the operation, the item, the target version and the text match and the 2 whole label sets are
  equal. A label-only proposal repeats the item's text, so 2 of them for one item differ only in
  their label sets.
- When a second label-only proposal for an item carries the same label set as the pending one, nixie
  merges it into the pending one, as it merges any duplicate proposal.
- When a second label-only proposal for an item carries other labels than the pending one, both
  wait. When you approve one, the item's revision moves, and nixie refuses your approval of the
  other as stale.

## Where label text is stored

- On disk, label text exists only sealed: in the 2 label records, in the `sealed` column of
  `memory_labels` and in the `sealed_labels` column of `memory_proposals`. nixie writes label text
  to no other record and no other column.
- `memory_labels` holds one row per item label record. Among the rows of one item, the row with the
  highest `sequence` gives the item's labels. Shape:
  [the projections](sketches/memory-index/02-types.ts), section G.
- In memory, the store's item index holds the unsealed gist, topic and trigger entries of each item.
  The store rebuilds them at each start.
- A forget removes the item's entries from the in-memory index and deletes the item's key. Every
  sealed label of the item, in a label record or a proposal, is then unreadable, and nothing leads
  from the item to its topic.

## Each write and its records

Flow: [a write that carries labels](sketches/memory-index/03-flow.ts), section C.

| Call                                             | Records nixie writes                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| A `memory.remember` that applies                 | `memory.version_added` and `memory.labelled`                     |
| A `memory.remember` that waits for review        | `memory.proposed` and `memory.proposal_labelled`                 |
| A `memory.edit` with `text` and a label, applied | `memory.version_added` and `memory.labelled`                     |
| A `memory.edit` with `text` and a label, waiting | `memory.proposed` and `memory.proposal_labelled`                 |
| A `memory.edit` with `text` and no label         | the version or the proposal alone                                |
| A label-only `memory.edit`                       | `memory.proposed` and `memory.proposal_labelled`                 |
| Your approval of a labelled text proposal        | the version and `memory.labelled`, with exactly the labels shown |
| Your approval of a label-only proposal           | `memory.labelled` alone                                          |

- nixie writes the records of a row in one transaction. After a kill, the log holds every record of
  the row or none.
- A proposal that waits for review writes nothing to its item. A proposal that creates an item has
  no item row until you approve it.
- The proposal record of a label-only edit from a task holds the origin `task` and the task's ID.
- When you reject a labelled proposal, or it lapses, nixie writes the same rejection or lapse record
  as for a proposal with no labels.
- A label-only edit changes no text version. So a session that read the item's text gets no second
  copy of it, and a pinned item gets no note in the `pinned-memory-changes` block.

## The sensitive flag

The designed system has no sensitive flag. nixie treats every item alike: an item's text can reach a
turn, and its gist shows in the index, whatever its text holds.

- The tools, the API, the web client, the projections and the published contract hold no sensitive
  mark. Recall, the index, a topic page and trigger push apply no filter for one.
- The gate never gives a write the review reason `sensitive`.
- A log or a database from a release with the flag can hold a proposal stored with that reason. So
  the code that renders a stored reason holds the value `sensitive`: `reviewReasons`,
  `renderReviewReason`, the API's `reason` list and the web label. Such a proposal shows `sensitive`
  with its sentence in the result of the write tool and in `memory.pending`, and the API returns
  `sensitive` for it. Text: [the sentence of each review reason](sketches/memory-gate/02-types.ts),
  section B. [The memory write gate](memory-write-gate.md) owns it. (open: review screen word)
- Such a log can hold `memory.sensitive_marked` and `memory.proposal_sensitive_noted` records. nixie
  skips them, with one exception. `buildProposalHash` hashes the flag for a proposal whose
  `memory.proposal_sensitive_noted` record is in the log, and it reads the flag from that record.
- The memory export has schema version 7, which has no `isSensitive`. `memoryExportSchema` reads
  versions 5, 6 and 7.

## Not in scope

- A batch proposal, or a review action for many proposals at once. A backfilled label is a
  placeholder. The agent replaces it with one label-only edit, one proposal and one answer per item.
- A setting on the gate for labels.
- A split or a merge of a topic that grew too big. The agent moves one item at a time with
  `memory.edit`, when you ask or on its own, or it starts a task that holds `memory.edit`.
- Label editing in the memory view.
- A short ID in place of the `proposalID` UUID in `memory.pending`.
  [Short IDs in tool records](short-ids.md) owns it.
- A rewrite of the 2 sensitive record kinds in a log, and a change to any other review reason.
