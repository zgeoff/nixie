# Task definitions: the file and the seed

nixie reads each task definition from a folder of the definitions repo. A task definition holds the
input of one `task.start` call and an optional trigger, so nixie can start the task without you,
from files that you read and diff. This doc covers the folder, the keys of its file, and what nixie
checks and stores when it loads the folder.

The sketches in `sketches/definitions/` hold the type shapes and the texts of the refusals and
notices that have a text. This doc holds the rules. An item marked `(open: <name>)` is not settled,
and [the open list](open/definitions.md) holds it. The section "Built" describes the code as it is.
Every other section describes the design.

The [glossary](../../glossary.md) defines task, task run, trigger, definitions, definitions source,
skill, record and model role. This design writes "task definition" for what the glossary lists as
"job".

Terms this doc adds:

- **Definitions repo.** The git repo that the definitions source reads.
- **Task definition.** A folder `tasks/<id>/` in the definitions repo. "Definition" alone means the
  same in these docs.
- **Definition ID.** The folder name `<id>`.
- **Definition version.** The content of one task definition at one seed.
- **Definition hash.** The hash of one definition version.
- **Seed.** One pass in which nixie reads the definitions source, checks every file, and puts the
  result in force in one write transaction.
- **Seed record.** The record that nixie writes when a seed puts definitions in force.
- **Manifest.** The file `nixie.yaml` at the root of the definitions repo. It holds the format
  number of the repo.
- **Snapshot form.** The canonical form of all definitions of one seed. nixie hashes it into the
  snapshot hash.
- **In force.** A definition version is in force when the last accepted seed holds it and the
  definition is enabled.
- **Step.** One unit of a task's work, which nixie commits as a whole. A **step file** is a
  different thing: the `.ts` file of a definition.

Related docs:

- [The task of a definition](definition-tasks.md) covers the one task that a definition has.
- [Task runs of a definition](definition-task-runs.md) covers what opens a task run.
- [Schedules](schedules-and-triggers.md) covers the `schedule` and `at` triggers.

## Built

This section lists the built code that the design uses or alters.

- `definitionsLayout.folders` holds `jobs`, `prompts`, `rules` and `skills`.
- `isDefinitionsPath` accepts `.json`, `.md`, `.yaml` and `.yml` files under every folder but
  `skills/`. Under `skills/` it accepts every file.
- `definitionsFormats` holds the format at which each kind of definition appeared: `skills` 2,
  `prompts` 3 and `rules` 3. Its `readable` list holds the manifest formats that a release reads: 2
  and 3.
- `buildDefinitionsSnapshot` writes `jobs: []` into the snapshot form.
- The port `DefinitionsSource` reads the definitions source. The path source is its one provider.
- `runSeed` runs a seed from the definitions source. `runInForceSeed` runs a seed from the
  definitions that are in force, with no read of the source.
- The table `skill_versions` stores each skill version under its hash.
- `planTaskStart(choice, starter, bounds)` checks a `task.start` call. The tasks module does not
  export it. `TaskStarter` holds `tools`, `memory` and `persona`.
- The task start tool builds its argument schema in `startArguments`. The schema accepts unknown
  keys, and the tasks module does not export it.

## The folder

The layout and the ID pattern are in [the definition folder](sketches/definitions/02-types.ts),
section A. Two example folders are in [a definition folder](sketches/definitions/01-usage.ts),
section A.

- A task definition is the folder `tasks/<id>/`.
- The folder must hold `task.yaml`.
- The folder can hold `instructions.md`.
- The folder can hold one step file, a `.ts` file. The `step.file` key of `task.yaml` must hold that
  file's name.
- A definition ID has only lowercase letters, digits and hyphens. It is at most 64 characters long.
  A skill's name follows the same pattern.
- Under `tasks/`, `isDefinitionsPath` accepts only `.yaml`, `.md` and `.ts` files.
- `definitionsLayout.folders` holds `tasks`, `prompts`, `rules` and `skills`.
- When a repo holds a `jobs/` folder, nixie does not read it. The seed record lists the folder among
  the root entries that nixie skipped.
- `definitionsFormats.tasks` is 4, and `definitionsFormats.readable` holds 3 and 4.
- When the manifest is at format 3, nixie loads no task definition. The seed record lists each file
  under `tasks/` as not applied.

## The keys of `task.yaml`

The type is [`TaskDefinition`](sketches/definitions/02-types.ts), section A.

A `task.yaml` holds 2 groups of keys: the keys of the `task.start` input, and the keys that only a
definition has.

The keys of the `task.start` input:

- [The task runner port](task-runner-port.md) owns the `task.start` input and its schema,
  `parseTaskStartInput` (open: start input schema).
- The definitions module imports that schema from the tasks module (open: definitions imports
  tasks).
- `name` and `brief` are required, as they are for `task.start`.
- When a definition sets `model`, its task runs use that model. When a definition omits `model`, its
  task runs use the model profile of the model role `task`.
- [The log grant](task-log-grant.md) owns the `log` key.
- [The report shape](task-report-shape.md) owns `reportShape`.
- [Task runs and reports](task-runs-and-reports.md) owns the report mode and its default.

The keys that only a definition has:

- `enabled` sets whether the definition can be in force. It is true when the file omits it.
- `trigger` sets what starts a task run. It holds one of `schedule`, `at` and `poll`.
  [Schedules](schedules-and-triggers.md) owns `schedule` and `at`.
- `target` sets what a fire of the trigger reaches. With `task`, the fire opens a task run. With
  `conversation`, the fire shows a reminder in the conversation. `target` is `task` when the file
  omits it.
- `context` sets whether each task run opens a session of its own (`fresh`) or resumes the session
  of the task run before it (`continuing`). It is `fresh` when the file omits it.
- `wakeable` is false when the file omits it. [Waking a task](task-wake.md) owns what it means.
- `maxCalls` caps the calls of a tool in one task run. [Task run limits](task-run-limits.md) owns
  its check and its enforcement.
- `skills` lists skill names. A task run pins the hash of each listed skill (open: skills key).
- `step` holds the name of the step file and an API version. The seed accepts the key and hashes the
  file. No code of this design runs the file.
- Whether a definition holds a `runner` key is not settled (open: runner key). A runner is the code
  that runs a task's steps: see [the task runner port](task-runner-port.md).

Other rules for the keys:

- nixie parses `task.yaml` with a strict schema: it refuses a file that holds a key outside the 2
  groups.
- The schema has no key `role`, `inputs` or `reportFields`, and no trigger kind `log`. nixie refuses
  each as an unknown key.
- When a definition has `target: task` and no trigger, nixie loads it and binds its task. nixie does
  not start a task run of it.

## What nixie refuses at a seed

The faults are listed as a type in [the seed faults](sketches/definitions/02-types.ts), section C.

One fault in one file refuses the whole seed. nixie refuses a seed that holds any of these 13
faults, and no other fault of a task definition:

1. A `tasks/<id>/` folder without `task.yaml`.
2. A definition ID outside the pattern.
3. An unknown key in `task.yaml`.
4. A `.ts` file whose name the `step.file` key does not hold.
5. A `step` key on a runner other than `nixie` (open: runner key).
6. A `target: conversation` definition that holds a key other than `name`, `brief`, `target`,
   `trigger` and `enabled`.
7. A `target: conversation` definition without a trigger.
8. A slot in `instructions.md` whose path the `task` prompt does not accept. A slot is a placeholder
   that nixie fills when it renders the file. `trigger.*` and `inputs.*` are not accepted paths.
9. A `poll` trigger. The poll sources own `PollFilter`, the value of a `poll` trigger, and they are
   not part of this design.
10. A `schedule` or an `at` value that breaks a rule of [schedules](schedules-and-triggers.md).
11. A `maxCalls` entry that [task run limits](task-run-limits.md) refuses.
12. A name in `skills` that is not a skill of the same seed.
13. A fault that `planTaskStart` refuses for the same `task.start` input.

- Each refusal gives the file and the fault. The sketches hold no refusal sentence (open: refusal
  text).
- nixie checks each definition through `planTaskStart`, the one check of a start.
  [The task runner port](task-runner-port.md) owns that check.
- `planTaskStart` takes a starter, the party that starts the task, and bounds, the limits of what a
  start can ask for. What the seed passes for each is not settled (open: seed starter).
- The seed calls checks of the tasks design, and the tasks design calls functions of this design.
  Which of the 2 is built first is the open item "seed check order" in
  [the tasks open list](open/tasks.md).
- [Memory tools on a task](memory-task-tools.md) owns whether a task can hold a memory tool that
  writes. The seed applies that rule through `planTaskStart` and has no rule of its own.
- When nixie refuses a seed, the definitions of the last accepted seed are in force.
- A seed is one write transaction. Its order is in [the seed flow](sketches/definitions/03-flow.ts),
  section A (open: seed step order).

## The definition hash and the version store

The shapes are in [the hash, the version table and the snapshot](sketches/definitions/02-types.ts),
section D.

- The definition hash covers 3 inputs: the parsed `task.yaml` with defaults filled, as canonical
  JSON; the hash of `instructions.md`; and the hash of the step file.
- Before nixie hashes `instructions.md`, it normalises the text with the function that normalises
  the persona file.
- A comment in `task.yaml` does not alter the hash.
- nixie stores each definition version under its hash in the table `task_definition_versions` (open:
  version table columns).
- nixie never deletes a row of `task_definition_versions`.
- The snapshot form holds a `tasks` list. Each entry holds the definition ID, the hash and the
  origin. nixie sorts the list by ID.
- The origin is `definitions` for a definition from the repo. The origin is `nixie` for a definition
  that the agent made, and that entry also holds a change ID.
  [Definitions from chat](definitions-from-chat.md) covers such a definition.
- The parser takes the text of the files as its input. It does not read the definitions source. A
  test can therefore check a definition that is in no definitions repo.

## A version that a task run pinned

- When a seed alters a definition, the next task run uses the altered version. A task run in
  progress uses the version that it pinned when it opened.
  [Decision 0013](../../decisions/0013-definition-versioning.md) records this rule.
- When `task_definition_versions` holds no row for a pinned hash, the step of the task run fails.
  After the step error limit, nixie sets the task to `failed`. A missing row is a fault of the
  version store, and no rule of this design causes it.

## Boundaries

- The definitions module parses `tasks/`, checks it, computes each hash and stores each version.
- The tasks module imports nothing from the definitions module.
- Task definitions add no port. The parser reads files that the definitions source returned.
- Task definitions add no config key.

## Not in scope

- A source of poll triggers. nixie refuses a `poll` trigger at the seed.
- A trigger kind `log`.
- Code that runs a step file.
- `task.report` and the check of a report shape, which [the report shape](task-report-shape.md)
  covers.
- A bypass of `slice1.read-only`, the rule of the decision point that allows a task run only the
  effects `read`, `fetch` and `note`. The tools that a definition lists get no such bypass.
- A way to start a definition that has no trigger.
- The keys `inputs` and `reportFields`.
- The rule format's field `jobs` and context `job` (open: rule format rename).
