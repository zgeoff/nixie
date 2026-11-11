# Memory index: the work as slices

The slices are in dependency order. Slices 1 to 3 are here. Slices 4 to 7, the index, its default,
trigger push and the cleanup, are in [the rollout slices](memory-index-rollout.md). Each is one pull
request. Each "Needs" line is a settled dependency, but for the orders that
[the open list](../open/memory-index.md) holds as (open: memory index slice order). The docs are
[the labels](../memory-labels.md), [the revision](../memory-revision.md),
[the memory index](../memory-index.md), [memory.recall](../memory-recall.md) and
[what memory a turn brings](../memory-turn-push.md). The sketches are in
`../sketches/memory-index/`.

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. Tests are in the
unit lane unless marked. Invent every text in a test. No check sends a turn to a production
deployment.

Slices 2 to 7 are [the memory index issue](https://linear.app/zgeoff/issue/GEO-2364), steps 1 to 5,
and [the sensitive flag issue](https://linear.app/zgeoff/issue/GEO-2363). Slices 6 and 7 follow
slice 5 directly, in the same milestone, with no wait, no measurement and no sign-off between them.

Each slice has the ID `memory-index-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `memory-index-n`.
[The work list](../work-list.md) gives the build order.

### memory-index-1. Recall by subject, and a recall page that fits

[The recall by subject issue](https://linear.app/zgeoff/issue/GEO-2523).

- **Outcome:** `memory.recall` takes `subjects`, and returns `searched` and `leftOut`. The store
  caps each page under the page limit before it writes the recall record, and writes no record for a
  recall that finds nothing. The store doc under `docs/architecture/memory/` and the tool's
  description say that a recall page is capped and that the record lists what the reply holds.
- **Follows:** "The result", "`leftOut`", "The page limit", "Where the size cap runs", "An oversized
  first item" and "The recall record" in memory.recall, without `topic` and `topics`; `02-types.ts`,
  sections H, I and J; `03-flow.ts`, sections F and G.
- **Needs:** nothing. (open: recall probes), (open: recall request names) and (open: page limit
  name) come first. It can land beside memory-gate-2 and memory-gate-3, the delete of the 2 built-in
  memory tasks, which removes 2 callers of the store's recall that pass no budget. Until that delete
  lands, the note-taker's recall passes `owner` and `shared`. No migration and no stored shape, so a
  rollback needs no step: the release before returns uncapped pages and records them whole.
- **Check:**
  - `bun test modules/memory/src/build-memory-tools.test.ts`:
    - `subjects: ["self"]` returns only self-notes, for the plain list and for a query. The input
      schema refuses an empty list and an unknown subject.
    - With 100 active items of 2,000 characters each, a recall with `limit: 100` returns a result
      whose `JSON.stringify` is at most the page limit in UTF-8 bytes, with the count it omitted and
      a `next`. A second call with that `next` starts at the first item omitted.
    - With 30 items of 2,000 characters that all match one word, a query with `limit: 30` returns a
      result within the page limit and the IDs it omitted, in rank order. A recall that passes those
      IDs with `limit: 30` returns the first of them. A recall that passes all 30 with `limit: 30`
      returns and omits IDs that together are the 30 named, with none twice.
    - A recall that passes 30 IDs of short items with no `limit` returns 20 items and lists the
      other 10 IDs, in the order named.
    - After each of the 3 recalls above, the newest `memory.recalled` record lists exactly the item
      versions in the result, and `memory.retire` of an omitted item gives the review reason
      `ambiguous_target`.
    - One item with 40 versions of 2,000 characters, recalled by ID with `includeHistory`, returns a
      result within the page limit with the count of versions it omitted, and the record lists only
      the versions returned.
    - 100 items of 2,000 three-byte characters each give a result within the page limit in bytes.
  - `bun test modules/memory/src/read-recall.test.ts`: the store returns the leading items under a
    budget, always returns the first, records only those, and returns the cursor of the last one; a
    request with no budget returns and records every item; a measuring function that rejects writes
    no `memory.recalled` record; the subject tests that exist pass.
  - `bun test modules/sessions/src/read-session-deliveries.test.ts`: a `memory.recalled` record that
    lists 3 versions, then a turn end that covers it, gives exactly those 3 versions as delivered.
  - `bun test libs/wire/src/tool-output-limit-tokens.test.ts`: the page limit divided by 2 is under
    `toolOutputLimitTokens`.
  - `bun test guests/conversation/src/sdk-contract/build-tool-output-plan.test.ts`: 2 cases, one per
    plan. One serves filler of exactly the page limit's bytes, and one serves filler of 30,000
    characters, both under the guest's tool-output settings.
  - `bun run test:agent-sdk guests/conversation/src/sdk-contract/run-tool-output-probe.agent-sdk.test.ts`
    (the Agent SDK lane). The guest cannot import the memory module, so the probe serves filler.
    Filler of the page limit's bytes reaches the stub model whole with no cut notice, at 2
    characters a token and at 0.5. Filler of 30,000 characters at 2 characters a token reaches the
    stub model with all its text under the cut notice. Both cases are part of the SDK contract
    suite.
  - Acceptance: a recall with `subjects: ["self"]` returns self-notes alone; no recall result passes
    the page limit, but for one current version that passes it alone; after every recall,
    `memory.recalled` lists exactly the item versions the result holds.
- **Milestone:** 1.

### memory-index-2. The labels and the revision

[The memory index issue](https://linear.app/zgeoff/issue/GEO-2364), step 1.

- **Outcome:** `memory.remember` and `memory.edit` take labels, `memory.recall` and `memory.pending`
  show them, the 2 label records and the 3 projection changes exist, and every path holds the number
  that the revision doc gives it. Each item of the deployment has labels. The glossary holds the
  terms of this family. What the agent gets at a session's opening and on a turn is as before the
  slice.
- **Follows:** every section of the labels but "The sensitive flag"; every section of the revision;
  the label fields of "The result" in memory.recall; `01-usage.ts`, sections A to C; `02-types.ts`,
  sections A to G; `03-flow.ts`, sections A to D. `memory.rated` and the ratings hold the text
  version until slice 7 deletes them.
- **Needs:** memory-index-1, memory-gate-2, memory-gate-3, memory-gate-5. memory-index-1 lands in
  milestone 1, and this slice adds the label fields to the recall output that it shaped.
  memory-gate-2 and memory-gate-3 delete the 2 built-in memory tasks, so that this slice adds labels
  to no tool of theirs. memory-gate-5 gives the memory write tools on a task; this order has no
  stated reason (open: memory index slice order). memory-gate-6, the gate's checks on labels and the
  review reason `labels`, needs this slice and ships in this pull request: the label-only cases of
  the check pass only with it. (open: path table), (open: last release) and (open: error texts) come
  first.
- **Migration:** `label_edits` on `memory_items` with a default of 0; the table `memory_labels`;
  `sealed_labels`, `target_revision` and `is_label_only` on `memory_proposals`. A release that does
  not know them selects none of them, and its inserts take the defaults.
- **Data step:** it runs at each start of the release and is insert-only. It finds an item to label
  by one test: the item has no label record. It writes no marker of a finished pass, so it finds an
  item that a kill left unlabelled and an item that the release before created after a rollback. It
  gives each such item a gist from the first 80 characters of its text, its subject as its topic and
  no trigger phrase, in one `memory.labelled` record with the change `backfilled` and the origin
  `migration`. A proposal written before this slice has the hash it had, its approval checks its
  `targetVersion`, and an item it creates gets the data step's labels.
- **Deploy:** take a backup first. After the deploy, you and the agent write the gists, topics and
  trigger phrases in the conversation, one label-only edit and one answer per item, under the
  proposal cap.
- **Rollback:** the release before skips the 2 record kinds and serves the same text. It shows and
  checks text versions, so it refuses a number the agent holds once. If it approves a label-only
  proposal, it writes a version with the same text: the item has the labels from before, the
  reviewed labels are lost, and a session that holds the item is offered its text once. An item that
  release creates has no labels until the next start of this release. That release shows the reason
  `labels` as `other`.
- **Check:**
  - `bun test modules/memory`:
    - labels round-trip through remember, edit, recall and pending;
    - a forget makes every label unreadable in every record, column and in-memory index;
    - a proposal written before this slice approves;
    - the data step run twice labels each item once;
    - a `memory.retire` after a label-only edit passes the read check for a text recalled before the
      edit;
    - a `memory.pin`, a `memory.unpin` and a forget after a label-only edit each succeed with the
      number the tool shows, and each record holds the number the revision doc gives it;
    - a label-only edit from the conversation and one from a task each write `memory.proposed` and
      `memory.proposal_labelled`, write no `memory.labelled`, and change no item;
    - the approval of a label-only proposal writes one `memory.labelled` with exactly the reviewed
      labels and no version;
    - a second label-only proposal with other labels is a proposal of its own, and one with the same
      labels merges into the first.
  - The gate's tests for labels are in the slices of the memory-write-gate family.
  - The pull request holds 2 proofs: the output of
    `git show <tag>:modules/memory/src/parse-memory-record.ts` for the tag of the last release a
    deployment ran, and a pass of the `compatibility` workflow's migration check, which runs in CI
    only.
  - `bun run check`, as the pull request's CI runs it.
  - Whether the API's `reason` list and the web label hold `labels` is (open: labels reason
    readers), and no check here covers it.
- **Milestone:** 2.

### memory-index-3. The sensitive flag

[The sensitive flag issue](https://linear.app/zgeoff/issue/GEO-2363).

- **Outcome:** The tool `memory.mark_sensitive`, the API procedure `markSensitive`, the 2
  `isSensitive` contract fields, the web client's toggle, the column `is_sensitive`, the filter in
  recall and in the search of a turn, and `pickSensitiveReview` with its call are gone. The export
  writes schema version 7. Every reader holds the reason `sensitive`. The glossary has no "sensitive
  item" entry. If a consolidation merge or the note-taker's `isSensitive` input is in the code when
  this slice starts, this slice removes it.
- **Follows:** "The sensitive flag" in the labels; `02-types.ts`, sections G, O and P.
- **Needs:** memory-index-2. It changes the same tool files. This slice lands before memory-index-4,
  so that the index never has a filter. (open: dropped column) comes first.
- **Migration:** drop `is_sensitive` from `memory_items` and `memory_proposals`. It changes no row
  and no other column. A proposal that is pending at the deploy and whose record noted the flag
  approves with a hash that includes the flag, read from its `memory.proposal_sensitive_noted`
  record.
- **Deploy:** take a backup directly before the deploy. Every release before this one selects the
  column, so none runs on the schema after the migration. Record the 2 contract breaks in
  `libs/contract/accepted-breaks.txt`. A client of the release before that calls `markSensitive`
  gets no procedure, and a release before this one refuses a version 7 export file.
- **Rollback:** a restore from that backup. No other rollback crosses this migration. It is the one
  exception to
  [the rule for a deploy and a rollback](../../../decisions/0049-milestone-deploys-and-the-rollback-target.md).
- **On the deployment:** the data step of slice 2 makes a gist from the first 80 characters of an
  item's text, which can be the detail itself. Edit the gists of the items that carried the mark
  after slice 2 and before slice 5, because the index shows them once slice 5 lands.
- **Check:**
  - `bun test modules/memory modules/sessions modules/api libs/db apps/web`: an item that carried
    the mark can place in a turn's retrieved block; the migration changes no row and no other
    column; a pending marked proposal approves; a proposal stored with the reason `sensitive`
    returns that reason from the API.
  - Derived from the case table and not agreed (open: sensitive reason tests), so not a gate: a
    `memory.remember` that passes its checks applies and gets no reason `sensitive`; a proposal
    stored with the reason renders the tool result in `02-types.ts`, section P.
  - `rg -n "pickSensitiveReview" apps modules guests libs` prints nothing.
  - `grep -rn "sensitive\|mark_sensitive\|isSensitive" modules apps libs --include="*.ts"` shows
    only the 2 record kinds and their parser, the proposal hash's flag for a stored marked proposal,
    the export versions 5 and 6, and the review reason with its sentence, its API value and its web
    label. The web label's text is (open: review screen word).
  - The `compatibility` workflow's check that the contract only grows passes with the 2 breaks
    recorded.
  - The live row counts of `memory_items` and `memory_proposals` before and after the deploy, as
    numbers. It is a read of production, so it needs you or the agent.
- **Milestone:** 2.
