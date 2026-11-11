# Slices: operations

The work of the operations design as slices, in dependency order. Slices 1 to 8 are here: the seed
rules, the rollback check and the evidence lanes. Slices 9 to 20, the backup and recovery work, are
in [the recovery slices](operations-recovery.md). The order of the slices inside one issue is a
first draft (open: operations slice order): see [the open list](../open/operations.md). Every test
command is a lane of [the evidence lanes](../evidence-lanes.md).

Slices 1 to 4 are [the seed rollout issue](https://linear.app/zgeoff/issue/GEO-2081). Slices 5 and 6
are [the rollback check issue](https://linear.app/zgeoff/issue/GEO-2529). Slices 7 and 8 have no
issue.

Each slice has the ID `operations-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `operations-n`.
[The work list](../work-list.md) gives the build order.

### operations-1. The lint config bump

[The seed rollout issue](https://linear.app/zgeoff/issue/GEO-2081).

- **Outcome:** nixie pins the release of `@zgeoff/oxlint-config` that holds the 2 seed rules, with
  both rules off. The bump crosses a breaking release that adds a folder rule and a file-name rule,
  so the pull request also fixes what those 2 rules report. Other work waits on rules of the bump,
  so the bump does not wait for the seeders.
- **Follows:** [the seed rules](../seed-rules.md), "The lint". `sketches/operations/02-types.ts`,
  section Q.
- **Needs:** nothing. The config release (open: lint config version).
- **Check:** `bun run lint` passes, and the pull request's CI run passes `lint:full`.
  `.oxlintrc.json` sets both seed rules to `off`.
- **Milestone:** no deploy.

### operations-2. The actions seeder and the API module's tests

[The seed rollout issue](https://linear.app/zgeoff/issue/GEO-2081).

- **Outcome:** The actions module exports `buildActionSeeder` with one test seed for each
  `ActionStatus`. The API module has a `buildSeeder`, its `setupTest()` returns `seed`, and its 7
  tests that insert into `actions` seed through `ctx.seed`. Each of those tests makes every
  assertion it made before.
- **Follows:** [the seed rules](../seed-rules.md), "Each module publishes a seeder" and "One
  `buildSeeder` for each package that seeds across modules". `02-types.ts`, section P.
  `01-usage.ts`, section C.
- **Needs:** operations-1. The reproducer (open: test API actions) runs first, as a test added to
  the test file of `startTestAPI`, which exists. When it fails, this slice registers
  `actionsProjection` in `startTestAPI`.
- **Check:** `bun run models && bun run test:bundles`, then
  `bun test modules/api/src/test-utils/start-test-api.test.ts`.
  `grep -rn "insertInto('actions')" modules/api/src --include='*.test.ts'` prints nothing. Each seed
  file has a test beside it. `bun run test` passes.
- **Milestone:** no deploy.

### operations-3. Every other seeder

[The seed rollout issue](https://linear.app/zgeoff/issue/GEO-2081).

- **Outcome:** The tasks, memory, connectors and backup modules each export their seeder, and the
  module that writes `identities` exports the identity seeds. The sessions module, the server app,
  `integration` and `e2e` each have a `buildSeeder`. Every test outside a module seeds that module's
  records through `ctx.seed`. On the design's commit, 43 Kysely writes (`insertInto(`,
  `updateTable(`, `deleteFrom(`) sit in 28 test files, and 7 `seed-*.ts` files exist. The 5 local
  `seed*` functions outside test utils and the raw SQL writes of the backup forget suite are gone.
  Each changed test makes every assertion it made before. A line that the 2 rules would report and
  that this slice does not reach gets a disable comment.
- **Follows:** [the seed rules](../seed-rules.md), all sections. `02-types.ts`, section P.
- **Needs:** operations-2. The identity seeds' module (open: identities writer).
- **Check:** `bun run test` and `bun run test:e2e` pass. Each seed file has a test beside it.
  `NIXIE_RESTIC_BINARY=<path_to_restic> bun run test:restic` passes for the backup forget suite.
- **Milestone:** no deploy.

### operations-4. The 2 seed rules as errors

[The seed rollout issue](https://linear.app/zgeoff/issue/GEO-2081).

- **Outcome:** `.oxlintrc.json` sets `zgeoff/seed-only` and `zgeoff/test-beside-seed` to `error`,
  and the repo holds no disable comment for either. Every test written after this slice seeds
  through `ctx.seed`.
- **Follows:** [the seed rules](../seed-rules.md), "The lint", "Where a direct write is allowed" and
  "Rules for a test and a test seed".
- **Needs:** operations-3.
- **Check:** `bun run lint` passes, and the pull request links its CI run, which passes `lint:full`.
  `git grep -n -e "seed-only" -e "test-beside-seed" -- apps modules libs e2e integration` prints
  nothing. `bun run test` and `bun run test:e2e` pass.
- **Milestone:** no deploy.

### operations-5. A previous release's bundle in the e2e lane

[The rollback check issue](https://linear.app/zgeoff/issue/GEO-2529).

- **Outcome:** One e2e test, in a suite that this slice creates, builds the server bundle of the
  highest `v*` tag from a git worktree and starts it on a data directory that the checked-out build
  wrote. The pull request states whether the build fits inside the lane's time.
- **Follows:** [the rollback check](../rollback-check.md), "What is not designed" (open: previous
  bundle).
- **Needs:** nothing.
- **Check:** `bun run test:e2e`. The result is a finding and no gate: either answer closes the open
  item.
- **Milestone:** 1.

### operations-6. The rollback check

[The rollback check issue](https://linear.app/zgeoff/issue/GEO-2529).

- **Outcome:** Before a milestone deploy, a check starts the rollback target on a log and a config
  that the release to deploy wrote, and compares what it does with the statements of each design.
  The shared test constant that sets only the 2 `enabled: false` keys of the built-in memory tasks
  is in the repo for the check.
- **Follows:** [the rollback check](../rollback-check.md), "What decision 0049 settles" and "What
  follows for the check". No sketch section.
- **Needs:** operations-5, memory-gate-1. memory-gate-1 builds the shared test constant,
  `builtInMemoryTasksOffConfig`. Every Not decided item of the rollback check in the open list:
  (open: check location), (open: rollback target source), (open: check log), (open: check pass),
  (open: expected results), (open: check blocks), (open: further back).
- **Check:** rests on (open: check pass) and (open: check location), so this slice has no gate until
  you decide both. The check sends no turn to a production deployment.
- **Milestone:** 1.

### operations-7. The lane tables after the delete of the 2 built-in memory tasks

No issue.

- **Outcome:** [The evidence lanes](../evidence-lanes.md) state the lanes that exist after the
  delete. The Built tables have no "Memory writer eval" row, its command and its committed report
  are gone, and "Committed eval reports" checks the checker's reports only. The section "The lanes
  of the designed system" has no line that the Built section then states. No design written after
  this slice names a removed lane or suite.
- **Follows:** [the evidence lanes](../evidence-lanes.md), "The lanes of the designed system".
- **Needs:** memory-gate-2, memory-gate-3. They are the delete of the 2 built-in memory tasks. That
  delete removes the note-taker's integration suite, the suites beside the deleted code with the
  consolidation commands and host procedures, the note-taker's crash suite, the note-taker option of
  `startSpawnedNixie` with its scripted model, and the harness's writes of `enabled: false` for both
  config sections. The delete release refuses a config that holds either section. Until that delete,
  the spawned nixie has both tasks off unless a suite asks for the note-taker, and the preview's
  config sets neither section, so a preview stack takes the default of each. The 2 status procedures
  (open: status procedures).
- **Check:** `bun run check:docs` lists no fault for the doc.
  `git grep -n "memory-writer-eval\|run-memory-writer-eval" -- docs/design/queue/evidence-lanes.md`
  prints nothing.
- **Milestone:** 1.

### operations-8. The read procedures after the memory index cleanup

No issue.

- **Outcome:** [The evidence lanes](../evidence-lanes.md) list no `memory/readRatingNotes` among the
  API read procedures. The section "The lanes of the designed system" has no line about the
  procedure.
- **Follows:** [the evidence lanes](../evidence-lanes.md), "The lanes of the designed system".
- **Needs:** memory-index-7. It is the cleanup step of the memory index, which removes the
  procedure.
- **Check:** `git grep -n "readRatingNotes" -- docs/design/queue/evidence-lanes.md` prints nothing.
- **Milestone:** 2.
