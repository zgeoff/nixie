# Memory gate: the delete of the 2 built-in memory tasks as slices

These are slices 1 to 4 of the memory gate family. Slices 5 to 8 are in
[the other slices](memory-gate.md). The doc is
[nixie with no built-in memory task](../memory-task-delete.md), and the sketches are in
`../sketches/memory-gate/`. Open items are in [the open list](../open/memory-gate.md). The issues
are [the note-taker issue](https://linear.app/zgeoff/issue/GEO-1849) and
[the consolidator issue](https://linear.app/zgeoff/issue/GEO-2114), the delete part of each.

Slices 2 and 3 are one release, so a deployment meets one config break and one release note. The
release adds no record kind and no migration. Run `bun run models && bun run test:bundles` once
before the unit tests of a slice. Tests are in the unit lane unless marked. Invent every text.

Each slice has the ID `memory-gate-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `memory-gate-n`.
[The work list](../work-list.md) gives the build order.

### memory-gate-1. The fixtures and the off-mode test

[The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849) and
[the consolidator issue](https://linear.app/zgeoff/issue/GEO-2114).

- **Outcome:** 2 committed log fixtures hold what the built-in tasks wrote, a loader appends a
  fixture to a test log, and one test proves that a nixie with both tasks turned off fails no step.
  The slice changes no product code.
- **Follows:** "Stored records of the 2 tasks" and "Stored prompt IDs" in the doc; `02-types.ts`,
  sections I and L; `01-usage.ts`, section H.
- **Needs:** nothing. Its first 2 checks are (open: fixture round trip) and (open: stored prompt
  fixture).
- **Builds:**
  - A script in the memory module's `test-utils` that writes the log fixture through
    `createWriterProposal`, `writePlannedBatch` and `createConsolidationDiff`.
  - `modules/memory/src/fixtures/built-in-memory-tasks-log.json`, which the slice creates beside
    `memory-export-v6.json`. It holds the log records and the keys they are sealed under: each of
    the 11 record kinds, a pending and an approved note-taker proposal whose approval gives an
    applied note-taker version, a planned batch with no publish, and an applied and a pending diff
    with a sealed summary and a comment.
  - `modules/prompts/src/fixtures/retired-prompt-ids-log.json`, which the slice creates: a closed
    and a pending `prompts.override_proposed` record for `writer`, a stored approval for
    `consolidator`, and definitions in force with a `writer` override. The script writes the stored
    approval through the approval path that the host's command calls, and the definitions in force
    through a seed of a manifest that holds a `writer` override.
  - The loader, a test util beside `startTestLog` in the log module's `test-utils`. It appends a
    fixture's records to a test log and restores the keys they are sealed under.
  - The shared test constant `builtInMemoryTasksOffConfig`.
- **Check:**
  - `bun test modules/memory`: a test that the slice creates loads the log fixture and rebuilds
    every projection.
  - `bun test modules/log`: a test that the slice creates loads a fixture and reads a sealed text
    back.
  - `bun test apps/server/src/main.test.ts`: a nixie started in process on the constant, on a data
    folder where both tasks ran and each holds an inbox record and a due timer, fails no step, logs
    both `off` events and writes no `memory.*` record in a turn.
- **Milestone:** 1. No deploy step.

### memory-gate-2. The delete of the note-taker

[The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849), its delete part.

- **Outcome:** The code holds no note-taker. Stored records of it parse, fold and render as the doc
  states, and the agent reads no "note-taker".
- **Follows:** every design section of the doc; `02-types.ts`, sections I, J, K and L; `03-flow.ts`,
  sections K and L.
- **Needs:** memory-gate-1. The texts (open: neutral event lines) and (open: deleted prompt
  refusal). The fault (open: stored event kinds). The choice (open: review screen word) for the web
  review screen.
- **Removes**, in the memory module unless another package is named:
  - The batch step, its planning, its session and its failure backoff: `runWriterStep`,
    `runWriterBatch`, `runWriterExtraction`, `readBatchBounds`, `planWriterBatch`, `writeBatchPlan`,
    `buildWriterFailure`.
  - The start, the wake per message and the runner: `startMemoryWriter`, `startMemoryWriterRunner`,
    and in the server `startWriterTask` and the part `memory_writer` of the memory part
    declarations.
  - The lease checks of a batch, in `writeBatchPlan` and `writeMemoryBatch`.
  - The catch-up: `pickBatchMode`, and the catch-up's line in the server's turn note reader.
  - The content gate for batches: `buildWriterGate`, `runWriterGate`, `tryRunWriterGate`,
    `runBatchGate`, `runBatchRetirementGate`, and their use in `buildMemoryWrites`.
  - The publish, the batch cap and the batch split: `writeMemoryBatch`, `tryWriteBatch`,
    `writeGatedBatch`, `planProposalCap`, `planBatchSplit`, `createBatchProposal`,
    `planBatchVersion`, and their use in `startMemoryStore`.
  - The staged tools and the staging: `buildWriterTools`, `createWriterStaging`.
  - `memory.flag-self-note`, the flag's record writer in `buildBatchRecords`, and its nudge line in
    the turn note reader.
  - The refusals for the note-taker as a caller, in `runSubjectGate` and `writeKeptMoment`, and the
    origin `memory_writer` of `WriteCaller`.
  - The prompt `writer`: `writerPrompt` in the prompts module, and its ID in `promptIDs`.
  - The model role `memory-writer`, in `modelRoles`, `buildModelsConfigSchema` and `roleNeeds`.
  - The config section `memory_writer`, whole: `writerConfigSchema`, its entry in
    `deploymentConfigSchema` and in the generated `config.schema.json`.
  - The task's row in the task directory (`buildTaskMessaging`), the part that started its step, and
    the sandbox that recovery holds for it (`runRecoverySteps`), all in the server.
  - `WriterStatusPanel` in the web client, and its use in `MemoryView`.
  - `e2e/crash/memory-writer.test.ts`, `integration/writer-turn-notes.test.ts` and
    `evals/memory-writer/`.
  - The seed helpers `createWriterProposal` and `writePlannedBatch`, which import removed code, and
    the off-mode test of slice 1. The constant and both fixtures are unchanged.
- **Does not touch:** `parseWriterRecord`, the `memory_writer` projection, `loadWriterModel`,
  `readOutsideVersions`, `readBatchNotices`, `buildCatchUpKind`, `buildSelfNoteFlagKind`, the
  checker, and the origin `memory_writer` in every enum that parses a stored record.
- **Changes:**
  - `systemSteps` maps `memoryWriterTaskID` to `runOffTaskStep`.
  - `promptIDs` and `storedPromptIDs` are 2 lists, and the 4 readers parse with the second.
  - Each renderer of the table in "What the agent reads" renders the origin `memory_writer` as the
    table states. The session prompt has no `instruction` part.
  - `memory.writerStatus` is marked deprecated and returns `isEnabled: false`. The web client's
    session probe is `sessions.list`.
  - Docs: remove `docs/architecture/memory/writer.md` and `writer-eval.md`. Edit the note-taker's
    parts of `docs/architecture/memory/writes.md` and `docs/design/platform/memory/writes.md`. The
    design doc gives the note-taker 3 tools where the code gives 5, and states that tasks call
    `memory.remember` and `memory.retire`. Edit the 6 shared docs:
    `docs/architecture/core/tasks.md`, `task-messages.md`, `model-profiles.md` and `prompts.md`,
    `docs/architecture/deployment/configuration.md`, and `docs/guides/overriding-a-prompt.md`.
- **Check:**
  - `bun test modules/memory`: the log fixture rebuilds every projection. The fixture's pending
    note-taker proposal is approved, and its version has the origin `memory_writer`. The memory
    view's reader and the export return a note-taker version with its model.
  - `bun run test:browser` (browser lane): the memory view shows a note-taker version with its
    model. A route loads with a live session when the server has no `memory.writerStatus`.
  - `bun run test:e2e` (e2e, spawned nixie): nixie starts on a data folder whose `memory-writer`
    task holds an inbox record and a due timer. The test writes both through `createSystemTask`, a
    task message and a timer. No step fails, the inbox is empty after one step, and the log holds no
    `memory.*` record from the step.
  - `bun test modules/prompts modules/definitions modules/api`, on the second fixture: the prompt
    lapse sweep runs, the host's pending list returns the pending proposal, an approval of it is
    refused, a rejection closes it, and the definitions in force read and render the session prompt.
    The exact refusal sentence rests on (open: deleted prompt refusal).
  - `bun test modules/memory modules/sessions modules/prompts`: each renderer, given a record with
    the origin `memory_writer`, gives text with no "note-taker" in it. The exact text rests on
    (open: neutral event lines).
  - `rg -n "flag-self-note" apps modules guests libs -g '!*.test.ts'` prints nothing. Run it by hand
    on the pull request.
  - CI: the `compatibility` workflow's job that runs `check-contract-growth.sh` passes with no line
    added to `libs/contract/accepted-breaks.txt`. The config schema check lists the removed section
    and keys, and the pull request's title carries `!`. The migration check of the release notes
    stage reports no added migration.
- **Milestone:** 1. It ships in the release of slice 3.

### memory-gate-3. The delete of the consolidator

[The consolidator issue](https://linear.app/zgeoff/issue/GEO-2114), its delete part.

- **Outcome:** The code holds no consolidator, no diff tool and no diff command. A pending diff
  lapses and applies nothing.
- **Follows:** "Who writes memory", "Stored records of the 2 tasks", "The 2 leftover tasks", "The
  config and the manifest" and "The 2 status procedures" in the doc.
- **Needs:** memory-gate-1, memory-gate-2. memory-gate-2 lands first or in the same pull request
  stack, because `consolidatorParts` imports the note-taker's model type (open: memory gate slice
  order). The check (open: change rows).
- **Removes**, in the memory module unless another package is named:
  - The step, its schedule read and its retry: `runConsolidatorStep`, `readConsolidationSchedule`.
  - The start and the runner: `startMemoryConsolidator`, `startMemoryConsolidatorRunner`, and in the
    server `startConsolidatorTask` and the part `memory_consolidator`.
  - `memory.consolidate`, the consolidator's recall and the staging: `buildConsolidatorTools`,
    `createConsolidationStaging`.
  - The diff's planning, its hash and its sealed writers: `planDiffRecord`,
    `buildConsolidationHash`, `encodeChangeText`, `encodeConsolidationSummary`.
  - `memory.diff` and `memory.comment`: `buildDiffTool`, `buildCommentTool`, their entries in
    `buildMemoryTools`, `writeChangeComment`, `readDeliveredDiff`.
  - The answers to a change and their wake: `writeChangeApproval`, `writeDiffApproval`,
    `writeChangeRejection`, `writeConsolidatorWakeInTransaction`.
  - The host commands `memory-diff`, `memory-diff-approve` and `memory-diff-reject`
    (`createConsolidationCommands` and its entry in `runCli`), and the host procedures under
    `memory.consolidation` (`createHostConsolidationProcedures`, its entry in `createHostRouter`,
    and their part of the host contract).
  - `ConsolidatorStatusPanel` in the web client, and its use in `MemoryView`.
  - The prompt `consolidator` (`consolidatorPrompt`) and its ID in `promptIDs`.
  - The model role `memory-consolidator`, in the 3 places of slice 2.
  - The config section `memory_consolidation`, whole: `consolidationConfigSchema`, its entry in
    `deploymentConfigSchema` and in `config.schema.json`.
  - The task's row in the task directory, the part that started its step, and the sandbox that
    recovery holds for it.
  - The seed helper `createConsolidationDiff`, and `docs/architecture/memory/consolidation.md`.
- **Does not touch:** `parseConsolidationRecord`, the 2 consolidation projections, the 3 released
  consolidation migrations, `startLapseSweep`, `runChangeLapses`, the retirement checker, and the
  versions and approval records that approved changes wrote.
- **Changes:** `systemSteps` maps `memoryConsolidatorTaskID` to `runOffTaskStep`.
  `memory.consolidatorStatus` is marked deprecated and returns `isEnabled: false`. The host
  contract's procedures need no accepted-breaks line, because the checked contract document is built
  from the device contract alone.
- **Check:**
  - `bun test modules/memory`: the fixture's pending diff lapses through the sweep and applies
    nothing. A forget of an item erases a summary that is sealed under it. The log fixture rebuilds
    every projection.
  - `bun run test:e2e` (e2e, spawned nixie): the test of slice 2, for the `memory-consolidator`
    task.
  - `bun test apps/server`: the conversation's tool list holds no `memory.diff` and no
    `memory.comment`. The host's command list holds no `memory-diff` command. The schema refuses
    `builtInMemoryTasksOffConfig`, unchanged, and a config that holds either section with any other
    key. It accepts a config with neither section, and a nixie started in process on that config and
    an empty log starts.
  - CI: as slice 2.
- **Milestone:** 1.

### memory-gate-4. The deploy of the delete, and its rollback

[The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849) and
[the consolidator issue](https://linear.app/zgeoff/issue/GEO-2114).

- **Outcome:** Each deployment runs the delete release, on files that hold none of the refused keys,
  with no failed step. The release note and `docs/architecture/deployment/configuration.md` state
  the rollback step.
- **Follows:** "The config and the manifest" in the doc; `01-usage.ts`, sections G and H;
  [decision 0049](../../../decisions/0049-milestone-deploys-and-the-rollback-target.md).
- **Needs:** memory-gate-2, memory-gate-3, memory-gate-5, operations-6. memory-gate-2 and
  memory-gate-3 are one release. memory-gate-5 is in the same milestone, so that the agent can start
  a task that tidies memory from the day of the deploy. operations-6 is the rollback check of a
  milestone: it starts the last deployed release on `builtInMemoryTasksOffConfig`. Per deployment,
  (open: last release off step).
- **Steps**, one deploy per deployment. No deploy turns the tasks off by config first:
  1. You answer each pending diff with the host commands. Then `nixie memory-diff`, a read-only read
     of production, shows no pending diff. The consolidator runs until the deploy, so it can write a
     diff after your last read. Such a diff lapses.
  2. Remove from the deployment's files what the release refuses: the sections `memory_writer` and
     `memory_consolidation` of `config.yaml`, `models.roles.memory-writer` and
     `models.roles.memory-consolidator`, and `prompts.writer` and `prompts.consolidator` in the
     `nixie.yaml` of the definitions repo.
  3. The deployment takes the release on those files.
  4. The server's log lines of the last start show no failed step. The edit of one deployment's
     files and the read of its log lines belong in the delivery brief, outside this repo.
- **What the deploy does to stored state:** The note-taker's cursor is where its last published
  batch put it, and no migration moves it. No task reads the messages past the cursor. When the
  process is killed during the first start of the release, the next start is the same start.
- **Rollback:** the target is the last release the deployment ran. Before a rollback to a release
  that holds the built-in tasks, set `builtInMemoryTasksOffConfig` in `config.yaml`. The config edit
  and the release change are one deploy. The step holds for every deployment, one first installed on
  the delete release included. No release checks the step. A deployment that takes the delete
  release again removes both sections again, in that deploy.

  | The deployment                                                      | What the release with the built-in tasks does                                                                                |
  | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
  | Took the delete, and sets the constant first                        | Accepts the config and gives both tasks the off step. It parses every record kind in the log                                 |
  | Took the delete, a started task wrote memory, and sets the constant | Reads those versions and proposals: the origin is `task`                                                                     |
  | Took the delete, and rolls back with neither section                | Starts both tasks. The note-taker reads every message since its cursor, and the consolidator runs once its period has passed |
  | First installed on the delete release, with the constant            | Creates neither task                                                                                                         |
  | First installed on the delete release, with neither section         | Creates both tasks. The note-taker reads the conversation from its first message                                             |

  With both tasks off, that release logs `memory_writer.off` and `memory_consolidator.off` at each
  start, lists neither task in the directory, and returns `isEnabled: false` from both status
  procedures. Its lapse sweep lapses pending proposals and changes. Its host commands read and
  answer a pending diff, and the off step empties the wake that an answer writes. Its conversation
  holds `memory.diff` and `memory.comment`. Its session prompt describes a note-taker while the
  note-taker is off. A deployment that runs that release with a task off sets that task's section.

- **Check:** on each deployment, as read-only reads of production that need you for each access:
  `nixie memory-diff` shows no pending diff ahead of the deploy, and the last start shows no failed
  step after it. No check sends a turn to a production deployment.
- **Milestone:** 1.
