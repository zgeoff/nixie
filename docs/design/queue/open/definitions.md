# Task definitions: what is not settled

Each item is marked in a doc or a sketch as `(open: <name>)`. The name is the bold text of the item.
The slices are in [the definition slices](../slices/definitions.md) and
[the chat, view and example slices](../slices/definitions-chat.md). The issues:
[the task definitions issue](https://linear.app/zgeoff/issue/GEO-1834),
[the schedules issue](https://linear.app/zgeoff/issue/GEO-1835),
[the definitions from chat issue](https://linear.app/zgeoff/issue/GEO-1836),
[the live view issue](https://linear.app/zgeoff/issue/GEO-1837),
[the note-taking example issue](https://linear.app/zgeoff/issue/GEO-1849),
[the consolidation example issue](https://linear.app/zgeoff/issue/GEO-2114) and
[the moment reflection issue](https://linear.app/zgeoff/issue/GEO-1334).

Three items of [the tasks open list](tasks.md) touch this family and are filed there once: "seed
check order", "claim order" and "briefID maker".

## Items that block a slice

Each item starts with its milestone and the slices that it blocks. An item blocks a slice when the
slice cannot be built or checked until the item is settled. [The open list](../open.md) holds every
blocking item of the queue.

- Slice 1: seed starter; definitions imports tasks; start input schema; version table columns; in
  part: runner key.
- Slice 2: hook context; claim order (the tasks list); definition task next state (the tasks list).
- Slice 3: in part: old client trigger.fired; notice text.
- Slice 5: triggers imports; in part: recovery hold fire.
- Slice 6: retireOneShot order.
- Slice 8: rule format rename.
- Slice 9: undefined types; decider clock; resolve command.
- Slice 10: notice text; undo output; ID casing; in part: old client definition.changed.
- Slice 12: ended task runs name; undefined types; view details.
- Slice 13: view details.
- Slice 14: example instructions text; previous start block (the tasks list); in part: gate quote
  thread (the memory gate list).
- Slice 15: example instructions text.
- Slice 16: example instructions text; in part: moment guide page.
- Tasks slice 7: first enabled time.
- Tasks slice 8: runner key.

## Not decided

- **rule format rename.** Milestone 3. Blocks slice 8. The rule format holds a field `jobs` and a
  context `job`. `ruleContexts` also holds `task`. One statement renames `jobs` to `definitions` and
  `job` to `task` at format 4, and has format 3 read both old names. That merges the rules of
  started tasks with the rules of a definition's task runs. No statement gives the name of
  `call.job` after the rename. Another statement has the rename wait for your decision. Options:
  rename as stated; give a definition's task runs a context of their own; do not rename. No option
  is chosen, and no doc builds on one.
- **runner key.** Milestone 3. Blocks tasks slice 8 and part of slice 1. The seed refuses "a `step`
  key on a runner other than `nixie`". `DefinitionOnly` holds no `runner` key, and `task.start`
  takes none in built code. The tasks family reads "the `runner` of the definition version", and
  `readDefinitionVersion` returns no such member. Options: a definition holds `runner` and the
  reader returns it; or every definition runs on the nixie runner and fault 5 is dropped.
- **seed starter.** Milestone 3. Blocks slice 1. The seed checks a definition through
  `planTaskStart(choice, starter, bounds)`. Built `TaskStarter` is `{ tools, memory, persona }` with
  no `log`. The tasks module does not export `planTaskStart`. The seed holds neither the tool
  registry nor the bounds. Intended: the starter may list any registered tool and holds the `log`
  grant, and the server app passes the check into the definitions module. The starter's `memory` and
  `persona`, and the bounds, have no stated value.
- **recovery hold fire.** Milestone 4. Blocks part of slice 5. What a fire gets when its task is
  under a recovery hold. Option 1: the reader reads the hold and returns `held`, nixie writes a skip
  with `task_held`, and the first slot after the release fires. Option 2: the reader does not read
  the hold, the first fire is unread until the release, and each fire after it skips with
  `still_running`. Intended: 1, and the docs follow it. The hold is work of
  [backup and recovery](../backup-and-recovery.md), so the read and its test wait for that work. One
  statement of the backup design has a recovery hold do nothing to a fire.
  [The hold release](../recovery-release.md) has a fire of a trigger wait on a held task's thread:
  under the rule of the trigger docs, only a fire from ahead of the hold can wait. The trigger docs
  list resume, restart and raise as what ends the skip, and omit the hold release. The definitions
  sketch adds it.
- **retireOneShot order.** Milestone 3. Blocks slice 6. `retireOneShot` is part of the schedule
  source and writes `definition.settled`, a record of the runtime layer. Which lands first is not
  stated. The slices' own answer, which nobody agreed: slice 6 ships `retireOneShot` for repo
  definitions, and slice 9 adds the record.
- **pull request split.** Milestone 3. Blocks no slice. The split of the work into slices and pull
  requests is a first draft.
- **example schedule values.** Milestone 3. Blocks no slice. The schedule in each example
  `task.yaml` (daily at 21:00, weekly on Sunday at 03:00, daily at 04:00) is a first draft. Any
  value that the schedule rules accept works.
- **moment guide page.** Milestone 3. Blocks part of slice 16. The 2 memory examples each have a
  guide page. The moment reflection example has none. Options: no page, or a third page. Intended:
  no page.
- "cited message" is filed once, as "gate quote thread" in
  [the memory gate list](memory-gate.md#known-faults).
- **ended task runs name.** Milestone 3. Blocks slice 12. The tasks family gives "finished" one
  meaning: a listed state of a wakeable task. The procedure `tasks.listFinished` and the route
  `/tasks/finished` use the word for ended task runs. Options: the names as first drafted, or names
  built on "ended".

## Not checked

- **definitions imports tasks.** Milestone 3. Blocks slice 1. Whether the definitions module may
  import the tasks module. Add the dependency to the definitions module's `package.json` on a branch
  and run `bunx turbo boundaries`. It passes: the import is allowed. It fails: the server app passes
  the schema in.
- **triggers imports.** Milestone 3. Blocks slice 5. Whether 2 imports form a cycle or break a
  boundary tag: the definitions module on the triggers module, and the triggers module on the tasks
  module. Add both dependencies on a branch, with an empty triggers module, and run
  `bunx turbo boundaries`. It passes: both imports are allowed. It fails on one: the server app
  passes that function in, as it passes `readDefinitionTask` and `retireOneShot`.
- **old client trigger.fired.** Milestone 3. Blocks part of slice 3. How the web client of the last
  release shows a `trigger.fired` record on the conversation's thread. In a second git worktree at
  the last release's tag, write the kind into a test log through that release's test utils. Open the
  conversation in that release's browser suite with `bun run test:browser`. The client shows nothing
  or a gap: the rollback note of slice 3 is "ignored". The client fails to render the thread: the
  rollback note is to roll back only with the web client of the release that has slice 3.
- **old client definition.changed.** Milestone 3. Blocks part of slice 10. The same check and the
  same 2 results, for a `definition.changed` record and the rollback note of slice 10.
- **erase of a change.** Milestone 3. Blocks no slice. Whether an erase can reach a
  `definition.changed` record. After slice 9, write a test beside the tests of the forget start in
  the API module: a record forget of a `definition.changed` record. nixie refuses the forget: no
  erase reaches the record, and the rule on a destroyed key covers only a lost key store. The forget
  goes through: the erase deletes the stored version in its own transaction, and the pull request
  holds that test.

## Not written

- **start input schema.** Milestone 3. Blocks slice 1. `TaskDefinition` is the `task.start` input
  plus the definition's own keys. Built code holds only `startArguments` inside the task start tool:
  not exported, not strict, with `name` and `brief` required. `parseTaskStartInput` of
  [the task runner port](../task-runner-port.md) is the intended schema.
- **version table columns.** Milestone 3. Blocks slice 1. The columns of `task_definition_versions`
  are not written. `skill_versions` holds `skill_hash`, `name`, `frontmatter` and `files`. Intended,
  after `StoredTaskDefinition`: `definition_hash`, `definition_id`, `form` and `files`.
- **hook context.** Milestone 3. Blocks slice 2. The definitions module calls
  `writeDefinitionTasksInTransaction` with a tasks context. No statement gives how the definitions
  module gets that context. Intended: the server app passes it in.
- **seed step order.** Milestone 3. Blocks no slice. The settled order is: every refusal, the hook
  that binds each task, the hook that arms each trigger, the `unchanged` return. Where the seed
  stores the versions, lays the runtime layer over the repo and writes the seed record is the
  sketch's own.
- **first enabled time.** Milestone 3. Blocks tasks slice 7. The tasks family needs "the time the
  definition was first enabled". Intended: the time of the first `task.definition_set` record of the
  definition's task that holds a hash. Nobody agreed it.
- **refusal text.** Milestone 3. Blocks no slice. No sentence exists for a seed refusal or a tool
  refusal. Each seed refusal gives the file and the fault. The tool refusals are codes. The sketch's
  conditions for `NOT_FOUND` and `UNCHANGED` are a reading of the code names.
- **notice text.** Milestone 3. Blocks slice 10 and part of slice 3. The notice of
  `definition.changed` has text for an added definition only. An altered definition, a deleted one
  and an undo have none. The `reminder` message has its first words and no wording for the scheduled
  time or for how late a catch-up is.
- **undefined types.** Milestone 3. Blocks slices 9 and 12. `DefinitionChangeResult`,
  `DefinitionMove`, `TaskSeedPlan` and `listedTask` are named and never defined. So are the `intent`
  parameter of `pickDefinitionMove`, the input of `pickRunDefinition` and the name of the rendering
  function. The sketch's own, which nobody agreed: the members of `RuntimeDefinitionChange`; the
  nullable members of a `triggers.report` entry; the member types of the 2 readers; the type of the
  `definitions` argument of the arming hook; the names of the constants; and the `outcome` and
  `hash` that `retireOneShot` writes.
- **view details.** Milestone 3. Blocks slices 12 and 13. 4 details of the views are not written.
  Which time of an entry the `since` of `triggers.report` compares. Which `definition.changed`
  record `createdBy` holds for a definition that changed more than once. Which procedure the
  raw-form control calls. How the list of ended task runs updates in an open client.
- **decider clock.** Milestone 3. Blocks slice 9. `pickDefinitionMove` is pure and refuses
  `ONE_SHOT_PAST` when a one-shot's time has passed. Neither `DefinitionState` nor the intent holds
  the time. Intended: the caller passes the time in.
- **example instructions text.** Milestone 3. Blocks slices 14, 15 and 16. No `instructions.md` text
  exists for an example. The example files list what each one tells the model to do.
- **example name and brief.** Milestone 3. Blocks no slice. The `task.start` input requires `name`
  and `brief`. The first-draft example files held neither. The values in the example files are the
  sketch's own.
- "previous start time" is filed once, as "previous start block" in
  [the tasks list](tasks.md#not-decided).

## Known faults

- **skills key.** Milestone 3. Blocks no slice. One statement puts `skills?: string[]` on a
  definition, has the seed check each name, and has a task run pin each skill's hash.
  `readDefinitionVersion` returns no `skills` member, so a task run cannot read the pinned skills.
  The sketch has the key on `DefinitionOnly` and no member on the reader.
- **undo output.** Milestone 3. Blocks slice 10. The procedure's own statement gives
  `{ definitionID, changeID }`. The undo table also returns `restored: 'repo'` in its conflict row.
  The sketch has `restored` as an optional member.
- **ID casing.** Milestone 3. Blocks slice 10. The tools spell `definitionId` and `changeId`. The
  records and the API spell `definitionID` and `changeID`. The sketch has each as its source spells
  it.
- **one-shot too late.** Milestone 3. Blocks no slice. One rule has a missed one-shot always fire,
  as a catch-up. One test has a one-shot "skipped under each of `too_late`, `still_running` and
  `task_held`". The docs follow the rule, and the slices' checks omit `too_late`.
- **resolve command.** Milestone 3. Blocks slice 9. One statement has you resolve a conflict with
  `nixie definitions resolve <id> --keep nixie|repo`, and treats the command as built. Built code
  holds `nixie rules resolve <id> --keep nixie|repo` and `nixie skill-resolve`. The docs name no
  command for a task definition.
