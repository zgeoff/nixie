# Memory index: the rollout slices

These are slices 4 to 7 of the memory index, in dependency order. Slices 1 to 3 are in
[the first slices](memory-index.md), with the rules for the tests of every slice. Each is one pull
request. Each "Needs" line is a settled dependency, but for the orders that
[the open list](../open/memory-index.md) holds as (open: memory index slice order). The docs are
[the memory index](../memory-index.md), [memory.recall](../memory-recall.md) and
[what memory a turn brings](../memory-turn-push.md). The sketches are in
`../sketches/memory-index/`. The issue is
[the memory index issue](https://linear.app/zgeoff/issue/GEO-2364), steps 2 to 5.

Each slice has the ID `memory-index-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `memory-index-n`.
[The work list](../work-list.md) gives the build order.

### memory-index-4. The memory index and recall by topic

[The memory index issue](https://linear.app/zgeoff/issue/GEO-2364), step 2.

- **Outcome:** A session's opening can hold the `memory-index` block, `ConversationMemory` has
  `readIndex`, the 4 `index_*` config keys exist, and `memory.recall` takes `topic` and `topics`. In
  this slice `index_tokens` defaults to 0, so a deployment that sets nothing gets no block.
- **Follows:** every section of the memory index but the default of `index_tokens`; "The kinds of
  call" in memory.recall; `01-usage.ts`, sections D to F; `02-types.ts`, sections H, K, L, N and P;
  `03-flow.ts`, sections E and F.
- **Needs:** memory-index-1 to memory-index-3, web-3. memory-index-1 changed `buildRecallTool`
  first, and this slice adds `lines` and `topics` to its output. web-3 puts short IDs in the record
  of a recall. It lands in milestone 1, ahead of `lines`, so this slice records `lines` by the rule
  of web-3. (open: index details), (open: index opening line), (open: index status lines) and (open:
  session index fields) come first. No migration and no record kind. A release that does not know a
  key refuses a config file that sets it, so remove the keys from the file before a rollback.
- **Check:**
  - `bun test modules/memory modules/sessions`:
    - the index is within its budget, folds the biggest topic first, and ends with the closing line
      when every topic is folded;
    - a gist in the index does not stop a push from offering the item's text;
    - an empty recall returns `searched` and appends no record;
    - a topic page past the page limit returns `leftOut` and a `next`;
    - an opening with the index, a task's opening and a topic page each append no record.
  - The value `oldest-first` waits for (open: fold order), and the tool's text for an empty recall
    for (open: empty recall text). Neither is a gate.
- **Milestone:** 2.

### memory-index-5. The index on by default

[The memory index issue](https://linear.app/zgeoff/issue/GEO-2364), step 3.

- **Outcome:** `index_tokens` defaults to 3,000, and `retrieval_items`, `retrieval_self_notes` and
  `retrieval_messages` default to 0, in `memoryConfigSchema` and in the second copy in
  `startConversationRunner`. A deployment that sets nothing opens each session with the index and
  gets no item from the similarity search. A deployment that sets one of the 4 keys has its value.
  The 3 `retrieval_*` settings exist until slice 7.
- **Follows:** "The config keys" in the memory index.
- **Needs:** memory-index-4. (open: zero limit search) comes first: this slice creates
  `modules/sessions/src/read-turn-retrieval.test.ts` for it. No migration and no record kind. A
  rollback to the release before restores the defaults of memory-index-4.
- **On the deployment:** edit the gists of the items that carried the sensitive mark before this
  slice ships. After the deploy, you and the agent edit gists and topics in the conversation.
- **Check:**
  - `bun test modules/memory modules/sessions`: the defaults, in both places; with all 3 limits at
    0, a turn gets no `retrieved-memory`, `retrieved-self-notes` or `retrieved-messages` block.
  - `bun run test:e2e` (e2e): a spawned nixie with invented items opens a session with the index and
    no retrieved block.
  - A change-note check on the conversation's model, on invented items: a session that opens with a
    full pinned core and the index, and holds the memory tools, gives the current value on each turn
    after a core change.
- **Milestone:** 2.

### memory-index-6. Trigger push and the port

[The memory index issue](https://linear.app/zgeoff/issue/GEO-2364), step 4.

- **Outcome:** `ConversationMemory` has `readTurnMemory` and no `recall` or `recallMessages`.
  `ConversationMemorySettings` has no `retrieval*` field, and the second copy of the defaults in
  `startConversationRunner` is gone. The memory module holds the selection with 2 pushes: trigger
  push and the similarity push, which is on only when a deployment sets a `retrieval_*` limit
  above 0. The 2 `trigger_*` keys exist.
- **Follows:** every section of what memory a turn brings but "What the designed system does not
  have"; `01-usage.ts`, section G; `02-types.ts`, sections L, M, N and Q; `03-flow.ts`, section H.
- **Needs:** memory-index-2, memory-index-4, memory-index-5. memory-index-2 and memory-index-4 give
  the trigger entries and `readIndex`. The order after memory-index-5 has no stated reason (open:
  memory index slice order): memory-index-5 changed both copies of the retrieval defaults first, and
  this slice deletes the second copy. (open: trigger floor), (open: rejected ask) and (open: trigger
  match shape) come first. No migration and no record kind.
- **Between this slice and slice 7:** with both pushes on, trigger items come first, then similarity
  items, with no item twice. Each push has its own cap and floor, and past messages come from the
  similarity push only. `memory.rate` after a turn that placed nothing rates the items of a turn
  before it, and no fix is built. (open: rate after an empty turn)
- **On the deployment:** after the deploy, you and the agent write trigger phrases for the items in
  the conversation. Trigger push places nothing until items have trigger phrases.
- **Check:** `bun test modules/memory modules/sessions`:
  - the cap and the floor of trigger push;
  - a turn that places nothing appends no `memory.recalled` record;
  - with both pushes on, trigger items come first and no item appears twice;
  - a pinned item, an item with no trigger phrase and an item the session holds are never placed;
  - a pick that is retired between the ranking and the placing is dropped, and the cap is not
    refilled;
  - a turn with every push off, or with blank text, reads nothing from the log.
- **Milestone:** 2.

### memory-index-7. The similarity push cleanup

[The memory index issue](https://linear.app/zgeoff/issue/GEO-2364), step 5.

- **Outcome:** The similarity push's file and its entry in `pickTurnPushes`, the `similarity` group
  of `TurnMemorySettings`, `readMessageMatches` on `TurnSources`, the 5 `retrieval_*` config keys,
  the tool `memory.rate` with its guidance, the API procedure `memory/readRatingNotes` and the web
  client's view of rating notes are gone. No line changes in the code that asks for a turn's memory,
  renders the blocks or writes the turn-ended record.
- **Follows:** "What the designed system does not have" and "The config keys" in what memory a turn
  brings; `02-types.ts`, sections M and N.
- **Needs:** memory-index-6.
- **Deploy:** before the deploy, remove the 5 `retrieval_*` keys from the deployment's config file:
  the release fails to start on a file that sets one. Mark the break in the pull request's title.
  Record the 2 contract breaks in `libs/contract/accepted-breaks.txt`. No migration.
- **Rollback:** the release before holds `memory.rate` and reads the `memory.rated` records in the
  log. It accepts a config file without the 5 keys.
- **Check:**
  - `bun test modules/memory modules/api apps/web`: a log that holds `memory.rated` records starts,
    and the release skips them; no tool list holds `memory.rate`.
  - `bun run check`, as the pull request's CI runs it.
  - `bun run --silent ci:config-schema:run-config-schema-check` reports the break that the title
    marks.
  - The `compatibility` workflow's check that the contract only grows passes with the breaks
    recorded.
- **Milestone:** 2.
