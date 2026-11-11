# Memory index: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`. The docs are
[the labels](../memory-labels.md), [the revision](../memory-revision.md),
[the memory index](../memory-index.md), [memory.recall](../memory-recall.md) and
[what memory a turn brings](../memory-turn-push.md). The sketches are in
`../sketches/memory-index/`. The work is in [the slices](../slices/memory-index.md) and
[the rollout slices](../slices/memory-index-rollout.md). The issues are
[the memory index issue](https://linear.app/zgeoff/issue/GEO-2364),
[the sensitive flag issue](https://linear.app/zgeoff/issue/GEO-2363) and
[the recall by subject issue](https://linear.app/zgeoff/issue/GEO-2523).

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 1: recall probes; page limit name; recall request names.
- Slice 2: path table; last release; error texts; in part: labels reason readers.
- Slice 3: dropped column; in part: review screen word (the memory gate list); sensitive reason
  tests.
- Slice 4: index details; index status lines; index opening line; session index fields; in part:
  fold order; smallest budget; empty recall text.
- Slice 5: zero limit search.
- Slice 6: rejected ask; trigger floor; trigger match shape.

## Not decided

- **fold order.** Milestone 2. Blocks part of slice 4. What `index_fold_order: oldest-first` orders
  by. The design gives the value and no rule. 2 readings: the topic whose newest item is oldest
  folds first, or the topic whose oldest item is oldest folds first. No option is the stated one.
  [The memory index issue](https://linear.app/zgeoff/issue/GEO-2364).
- **index details.** Milestone 2. Blocks slice 4. These details come from
  [the memory index issue](https://linear.app/zgeoff/issue/GEO-2364) and the design sheet does not
  state them: the format of the block and of an index line, the subject headings, the folding order,
  the closing line, and the defaults of `index_tokens` (3,000), `index_fold_order`,
  `index_item_order` and `index_topic_page` (200). The docs follow the issue. They wait for your
  word that the issue is the source.
- **labels reason readers.** Milestone 2. Blocks part of slice 2. Whether the API's `reason` list
  and the web client's label take the review reason `labels`. Without them the API and the web show
  `other` for a label-only proposal. No option is stated.
  [The memory index issue](https://linear.app/zgeoff/issue/GEO-2364).
- "web label text" is filed once, as "review screen word" in
  [the memory gate list](memory-gate.md#not-decided).
- **memory index slice order.** Milestone 2. Blocks no slice. These orders have no stated reason, so
  only the dependency facts in the slices are settled: the labels after the memory write tools on a
  task; trigger push after the index is on by default, when it needs only the labels and
  `readIndex`; the order of the commits inside each slice.
  [The memory index issue](https://linear.app/zgeoff/issue/GEO-2364).
- "Codex page" is filed once, as "codex tool output limit" in
  [the harnesses list](harnesses.md#not-checked).

## Not checked

- **recall probes.** Milestone 1. Blocks slice 1. 4 facts about the Agent SDK's command-line
  program, from [the recall by subject issue](https://linear.app/zgeoff/issue/GEO-2523). Write the
  probe cases of slice 1 first, on the built code, and run
  `bun run test:agent-sdk guests/conversation/src/sdk-contract/run-tool-output-probe.agent-sdk.test.ts`.
  - Filler of the page limit's bytes arrives whole at 2 characters a token and at 0.5: the page
    limit stands. It is cut at 0.5: lower the page limit to the size the program never counts.
  - Filler of 30,000 characters arrives with all its text under the cut notice: the rule for one
    oversized item stands. It does not: rework that rule first.
  - A structured result arrives as `JSON.stringify` of it: the cap measures what the model gets. It
    does not: the measuring function renders the result the way the program does.
  - `bun run test:model-api evals/sdk-contract/tool-output.model-api.test.ts`, by hand, with
    invented items in the recall shape: the model counts 2 bytes a token or more, and the page limit
    stands. Fewer matters only if the first probe fails, and the page limit then takes the measured
    rate.
- **interrupted recall.** Milestone 1. Blocks no slice. An interrupted turn after a recall record
  may count the recall's items as delivered. It is a suspected cause from reading the code, with no
  reproduction. A new e2e test holds a recall at the fault point `memory.recall.checked`, interrupts
  the turn, releases the fault point and reads the session's deliveries (`bun run test:e2e`). The
  items are listed: the defect is real and gets an issue of its own. They are not: remove the case
  from the recall doc's "Not in scope". The record's sequence is above the turn-end mark: the test
  proves nothing. It gates no slice.
- **path table.** Milestone 2. Blocks slice 2. The 2 lists in the revision doc name every reader of
  an item's version. Run
  `rg -n "target\.version|targetVersion|readVersion\(" modules apps libs -g '!*.test.ts'` on the
  commit slice 2 branches from, and read the output by hand. Every line falls under an entry of the
  lists or is in the web client's mocks: build the slice. A line with neither: add the entry and its
  test first.
- **last release.** Milestone 2. Blocks slice 2. The last release a deployment ran skips an unknown
  record kind and reads the schema of slice 2. Read
  `git show <tag>:modules/memory/src/parse-memory-record.ts`, and `git diff <tag> -- libs/db/src`
  against the slice's migration, by hand, where `<tag>` is that release's tag. The parser returns
  nothing for an unknown kind, and that release selects no column the slice drops or renames: the
  rollback note of slice 2 holds. Otherwise slice 2 waits for the rule on how production takes
  releases.
- **dropped column.** Milestone 2. Blocks slice 3. What the migration check does with a dropped
  column. Open a draft pull request with only the migration that drops `is_sensitive`, and read the
  job of the `compatibility` workflow that runs
  `bun run --silent ci:compatibility:run-migration-check`. It passes: slice 3 needs nothing more
  from that job. It fails: slice 3 records the break the way the workflow asks.
- **zero limit search.** Milestone 2. Blocks slice 5. A search of a turn with a limit of 0 returns
  no item and appends no record. Slice 5 creates `modules/sessions/src/read-turn-retrieval.test.ts`
  with that case on the built code. No item and no record: the defaults alone turn the similarity
  push off. An item or an error: slice 5 adds a branch that skips the search at 0.
- **rejected ask.** Milestone 2. Blocks slice 6. What the step runner does when the ask for a turn's
  memory rejects. Add a case to the sessions module's turn tests with a memory stub whose `recall`
  rejects, on the built code, and run `bun test modules/sessions`. The step fails and reruns: the
  port adds no catch. The turn is lost, or runs with no memory and no word: stop and ask which rule
  the port's failure handling takes.
- **item field sizes.** Milestone 1. Blocks no slice. Nobody has measured the largest size of an
  item's `about` line or of its moment links. The measuring function counts both, so the cap holds
  whatever the size. It gates nothing.

## Not written

- **trigger floor.** Milestone 2. Blocks slice 6. `trigger_min_score` has no default number. The
  intended rule: a high floor, set as a tuning value in the pull request of slice 6, with no replay
  and no measurement.
- **index status lines.** Milestone 2. Blocks slice 4. The 2 status lines of the index have no
  wording. They give the count of index items, and the index's tokens against its budget.
- **index opening line.** Milestone 2. Blocks slice 4. The first line of the block has no wording.
  It covers what the index is, how to read an item and how to open a folded topic.
- **smallest budget.** Milestone 2. Blocks part of slice 4. By the design, the index is never over
  `index_tokens`. The design has no rule for a budget smaller than the first line, the headings and
  the closing line together.
- **empty recall text.** Milestone 2. Blocks part of slice 4. The tool's text for a recall that
  finds nothing has no wording. Its content: the tool searched and found nothing.
- **error texts.** Milestone 2. Blocks slice 2. 6 tool errors have no wording. The sketch lists them
  in `02-types.ts`, section P.
- **page limit name.** Milestone 1. Blocks slice 1. The constant in `02-types.ts`, section I has a
  placeholder name. The pull request of slice 1 picks the name.
- **recall request names.** Milestone 1. Blocks slice 1. The 2 members that the recall tool gives
  the store, in `02-types.ts`, section J, have this sketch's names.
- **session index fields.** Milestone 2. Blocks slice 4. `SessionIndex` holds the block's text and
  the counts for the 2 status lines. Its field names in `02-types.ts`, section K are this sketch's.
- **trigger match shape.** Milestone 2. Blocks slice 6. `readMatches` of `TriggerIndex` returns one
  match per item, scored by the item's best trigger phrase. The match type in `02-types.ts`, section
  M is this sketch's.
- **sensitive reason tests.** Milestone 2. Blocks part of slice 3. The design gives no tests for the
  review reason `sensitive` once no write gets it. The tests in slice 3 are derived from the
  design's case table, and are not agreed.

## Known faults

- **rate after an empty turn.** Milestone 2. Blocks no slice. By the design, `memory.rate` rates the
  items of the thread's newest `memory.recalled` record, and that a turn that places nothing appends
  no record. So between slices 6 and 7, `memory.rate` after such a turn rates the items of a turn
  before it. The docs follow the second statement, and no fix is built: slice 7 deletes the tool.
- **leftOut for versions.** Milestone 1. Blocks no slice. By the design, a result has `leftOut` only
  when it omits an entry. By the design too, a result with one oversized item, which omits no entry,
  gives `leftOut.versions`. The docs follow the second: such a result has `leftOut`.
- **messages on the port.** Milestone 2. Blocks no slice. By the design, the port's ask and answer
  hold `readMessages` and `messages`, and that no push reads or fills them once the similarity push
  is gone. The docs follow both: the 2 members exist and are unused.
