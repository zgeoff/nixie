# Memory gate: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`. The docs are
[the write gate](../memory-write-gate.md),
[the gate's checks on labels](../memory-write-gate-labels.md),
[memory tools on a task](../memory-task-tools.md),
[nixie with no built-in memory task](../memory-task-delete.md) and
[the eval of memory settings](../memory-settings-eval.md). The sketches are in
`../sketches/memory-gate/`. The work is in [the delete slices](../slices/memory-gate-delete.md) and
[the other slices](../slices/memory-gate.md).

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 1: fixture round trip; stored prompt fixture.
- Slice 2: deleted prompt refusal; neutral event lines; stored event kinds; in part: review screen
  word.
- Slice 3: change rows.
- Slice 4: last release off step.
- Slice 5: start refusal text.
- Slice 6: in part: labels web text.
- Slice 7: cross-thread evidence; log grant tests; gate quote thread.
- Slice 8: eval park.
- Definitions slice 14: in part: gate quote thread.
- Memory index slice 3: in part: review screen word.
- Web slice 3: in part: change rows.

## Not decided

- **review screen word.** Milestone 1. Blocks part of slice 2 and part of memory index slice 3.
  Whether your memory review screen in the web client shows the word "note-taker" for a record that
  the note-taker wrote. Options: show it, because the label describes what wrote the record, or use
  neutral words as the agent's renderers do. No option is the intended one. The web sentence for the
  reason `sensitive` holds the word too, and its neutral option is the sentence of
  `renderReviewReason`. [The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849).
- **memory gate slice order.** Milestone 1. Blocks no slice. The order of the 2 pull requests inside
  the delete release, and of the task tools slice against the delete, has no stated reason. The
  dependency facts in the slices are settled: the 2 deletes are one release, the fixtures land
  first, and the task tools ship in the same milestone.
  [The consolidator issue](https://linear.app/zgeoff/issue/GEO-2114).
- **eval park.** Milestone: no deploy. Blocks slice 8. Whether to design the eval at all. Options:
  park it until a task runner exists, or design it. Intended: park it.
  [The eval issue](https://linear.app/zgeoff/issue/GEO-2360) holds this item and the 4 after it.
- **eval start.** Milestone: no deploy. Blocks no slice. What starts an eval. Options: a task that
  the agent starts on the atc runner, a scheduled task definition, or both. Intended: a task that
  the agent starts, and no schedule until you have read one report.
- **eval ratings guard.** Milestone: no deploy. Blocks no slice. What guards against the agent
  fitting its own ratings. Options: a held-out split, a second labeller, or your check ahead of a
  setting change. Intended: a held-out split by a fixed seed, and your check.
- **eval setting change.** Milestone: no deploy. Blocks no slice. Who changes a setting after an
  eval. Options: the agent proposes and you approve, or the agent changes it. Intended: the agent
  proposes, and you approve.
- **eval data place.** Milestone: no deploy. Blocks no slice. Where the eval reads and writes.
  Options: an export on the deployment's host, or an export copied to where the coding session runs.
  Intended: only hosts you control, with aggregate numbers in the report. Whether the memory export
  holds the `memory.rated` records, or the eval reads them from the event log, is part of this
  choice.

## Not checked

- **cross-thread evidence.** Milestone 3. Blocks slice 7. The built gate does not find an event that
  a task cites from the conversation's thread. On `origin/main`, add a case to
  `modules/memory/src/build-memory-tools.test.ts`: a `memory.remember` on a task's thread with a
  quote and the `eventID` of your message on the conversation's thread. Run
  `bun test modules/memory/src/build-memory-tools.test.ts`. It waits with `no_quote`: build slice 7.
  It applies: the gate reads across threads, so stop and rework the rule ahead of any change.
  [The log grant issue](https://linear.app/zgeoff/issue/GEO-2525).
- **fixture round trip.** Milestone 1. Blocks slice 1. A committed log fixture, with sealed records
  and their keys, loads into a test log and rebuilds every projection. Write the script, the
  fixtures, the loader and the round-trip test of slice 1 first, and run
  `bun test modules/memory modules/log`. It round-trips: every rebuild test of slices 2 and 3 reads
  the fixture. The keys cannot be restored from a file, because a key is wrapped under a value of
  the data folder: the fixture is a committed data folder, and the tests that read it are rewritten
  ahead of slice 2. [The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849).
- **stored prompt fixture.** Milestone 1. Blocks slice 1. The built code can write the stored
  approval and the definitions in force of the second fixture. The fixture script writes a stored
  approval for `consolidator` and definitions in force with a `writer` override, and a test reads
  both back. Run `bun test modules/prompts modules/definitions`. Both are written: the stored prompt
  ID check of slice 2 stands. No path writes one of them: the check drops that record, and the pull
  request of slice 2 states which reader is then unproved.
  [The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849).
- **last release off step.** Milestone 1. Blocks slice 4. The last release a deployment ran holds
  both `enabled` keys and the off step. By hand, per deployment, with the tag that the delivery
  brief gives: `git show <tag>:modules/memory/src/writer-config-schema.ts`,
  `git show <tag>:modules/memory/src/consolidation-config-schema.ts` and
  `git show <tag>:apps/server/src/run-off-task-step.ts`. All 3 show the key and the step: the
  rollback step and the rollback table of slice 4 hold for that deployment. One is missing: the step
  does not hold that task off on that release, so the deployment first takes a release that has
  them, and then the delete.
- **change rows.** Milestone 1. Blocks slice 3 and part of web slice 3. The rows of
  `memory_consolidation_changes` are the same after the delete as ahead of it. The work on short IDs
  depends on the answer. In slice 3, the rebuild test of the log fixture compares that table's rows
  with the rows that slice 1 recorded: `bun test modules/memory`. The rows match: the short-ID work
  may read them. A row is missing: the short-ID work has no change row to give an ID, and its design
  is reworked first. The swap of `log.read` in [short IDs in tool records](../short-ids.md) then
  omits `changeID` always. [The consolidator issue](https://linear.app/zgeoff/issue/GEO-2114).

## Not written

- **log grant tests.** Milestone 3. Blocks slice 7. The first-pass design gave no tests for the
  cases of a granted task's cited quote. The cases in slice 7 follow the rules of the doc one for
  one, and nobody agreed them. [The log grant issue](https://linear.app/zgeoff/issue/GEO-2525).
- **start refusal text.** Milestone 1. Blocks slice 5. The reason and the sentence of a refused
  start in 2 cases: a start that names a memory write tool without `memory: read`, and a start that
  names a memory write tool that its starter lacks. The built reasons `memory_tools` and
  `wider_tools` have sentences that fit, in `02-types.ts`, section H. Nothing states that they are
  the answer. [The task write tools issue](https://linear.app/zgeoff/issue/GEO-2519).
- **deleted prompt refusal.** Milestone 1. Blocks slice 2. The one sentence of a refused approval of
  a prompt proposal for `writer` or `consolidator`. The intended rule: it states that the prompt is
  deleted, and nixie writes nothing.
  [The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849).
- **neutral event lines.** Milestone 1. Blocks slice 2. The exact text of the 4 event lines for the
  origin `memory_writer`: a proposal's answer, a merge, a stored catch-up and a stored self-note
  flag. The intended rule: neutral words, such as "a proposal", with no "note-taker" and never "you
  noted it". [The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849).
- **labels web text.** Milestone 2. Blocks part of slice 6. The web review screen's sentence for the
  reason `labels`, in `formatReviewReason`. Whether the web client takes the reason at all is
  "labels reason readers" in [the memory index list](memory-index.md#not-decided).
  [The memory index issue](https://linear.app/zgeoff/issue/GEO-2364).

## Known faults

- **gate quote thread.** Milestone 3. Blocks slice 7 and part of definitions slice 14. One statement
  has the gate read a cited event on the `logThread` of the tool run. Another has the gate read the
  task's setup at the save. The runner sets `logThread` per step, so the 2 differ when a task's
  setup changes inside a step. The docs follow the first, and state the second as the rule for a
  save in a step after the change. The note-taking example of the definitions family and the log
  grant of the tasks family wait for this rule.
  [The log grant issue](https://linear.app/zgeoff/issue/GEO-2525).
- **stored event kinds.** Milestone 1. Blocks slice 2. One statement removes the event kinds of the
  catch-up and of the self-note flag. Another has a stored record of each render in neutral words.
  The docs follow the second: both renderers exist, and no code writes a record for either.
  [The note-taker issue](https://linear.app/zgeoff/issue/GEO-1849).
- **effect name.** Milestone 1. Blocks no slice. The code declares the effect `note` on
  `memory.remember`, `memory.edit` and `memory.retire`. Decision records 0011 and 0051 give the
  effect as `memory_write`. The docs follow the code, and write "a rule on a memory tool" where a
  record has the effect. [The task write tools issue](https://linear.app/zgeoff/issue/GEO-2519).
- **eval ratings source.** Milestone: no deploy. Blocks no slice.
  [The eval of memory settings](../memory-settings-eval.md) gives an eval one source of ratings, the
  `memory.rated` records of the event log. [What memory a turn brings](../memory-turn-push.md) gives
  the agent no `memory.rate` tool and no rating of pushed items, so only a log from a release with
  the tool holds such records. Each doc states its own rule.
  [The eval issue](https://linear.app/zgeoff/issue/GEO-2360).
