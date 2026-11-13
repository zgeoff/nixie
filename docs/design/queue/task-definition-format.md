# The task definition format

- **Status:** draft
- **Work items:** [the format and the seed](https://linear.app/zgeoff/issue/GEO-1834),
  [the task of a definition](https://linear.app/zgeoff/issue/GEO-2531),
  [the runtime layer](https://linear.app/zgeoff/issue/GEO-2533),
  [the docs say "task definition"](https://linear.app/zgeoff/issue/GEO-2536),
  [the rule format renames `jobs`](https://linear.app/zgeoff/issue/GEO-2634),
  [the note-taking example](https://linear.app/zgeoff/issue/GEO-2532),
  [the consolidation example](https://linear.app/zgeoff/issue/GEO-2530),
  [the moment reflection example](https://linear.app/zgeoff/issue/GEO-1334),
  [the full decision point](https://linear.app/zgeoff/issue/GEO-1803), which reads `destinations`

A task definition is a folder `tasks/<id>/` in the definitions repo. Its `task.yaml` holds the input
of one `task.start` call and an optional trigger, so nixie can start the task without you, from
files you read and diff. A seed parses every folder with one schema, refuses the whole seed on one
fault, hashes each definition and stores each version under its hash. A field the schema does not
know is no fault: the seed ignores it, logs a warning that names it, and keeps the rest. A
definition that the agent makes from chat follows the same schema and the same store.

Terms: the definitions repo is the git repo that the definitions source reads. The definition ID is
the folder name. A definition version is the content of one definition at one seed, and the
definition hash is its hash. A definition is in force when the last accepted seed holds it and it is
enabled. The glossary's "job" is a task definition.

## Shape

```mermaid
flowchart LR
  source[definitions source] -->|"files' text"| parse[parse tasks/]
  parse -->|"SeedFault"| refuse[seed refused, last seed stays]
  parse -->|"TaskDefinition"| check[checkTaskStart]
  check --> hash[definition hash]
  hash --> store[(task_definition_versions)]
  hash --> snap["snapshot form: tasks list"]
  store -->|"readDefinitionVersion"| tasks[tasks module]
```

## Contracts

### The folder and `task.yaml`

```yaml
# tasks/water-the-tomatoes/task.yaml
name: Water the tomatoes
brief: Read what memory holds about the garden and say what needs water this week.
trigger:
  schedule:
    every: week
    on: fri
    at: '08:00'
tools:
  - memory.recall
report: wake

# tasks/dentist/task.yaml: a reminder, with no task
name: Dentist
brief: Call the dentist about the check-up.
target: conversation
trigger:
  at: '2027-03-09T14:00:00+11:00'
```

```ts
// definitions module. The schema is strict: a key outside both groups is a fault.
type TaskDefinition = TaskStartInput & DefinitionOnly;
// TaskStartInput: the output of parseTaskStartInput, tasks module, from the task runner port work
// (not built). It holds `name` and `brief` (both required), `model`, `persona`, `memory`, `tools`
// and `report`, and gains `log` and `reportShape` when the tasks work adds them to that schema.

interface DefinitionOnly {
  enabled: boolean; // default true
  trigger: Trigger | null; // default null
  target: 'task' | 'conversation'; // default 'task'. 'conversation': a fire shows a reminder
  context: 'fresh' | 'continuing'; // default 'fresh'. 'continuing' resumes the last task run's session
  wakeable: boolean; // default false. The task wake work owns its meaning.
  step: { file: string; api: 1 } | null; // default null. The seed hashes the file; no code runs it.
  destinations: string[]; // default []. Patterns in the rule format, where `*` is the only wildcard.
  // Stage 5 of the decision point gives a matching destination of the definition's task run the
  // permission `job`: decision-point-cutover.md
  // maxCalls: added by the task run limits work, with its own seed check and fault code
}

// contract lib, beside isTimeZone. The definitions schema, the triggers module, the chat tools and
// the API all read it, and the contract lib is the one place every one of them may import.
type Trigger = { schedule: Schedule } | { at: string }; // at: ISO 8601 with an offset or `Z`
// Schedule: its keys and rules are in the trigger core design: ./triggers.md#schedule
```

The folder:

```text
tasks/<id>/task.yaml        required
tasks/<id>/instructions.md  optional
tasks/<id>/<name>.ts        one step file, allowed only when step.file names it
```

### What a seed refuses

```ts
// definitions module. One fault in one file refuses the whole seed.
interface SeedFault {
  path: string; // the file, such as 'tasks/dentist/task.yaml'
  fault: SeedFaultCode;
  reasons: string[]; // the sentences of the schema or of checkTaskStart; empty for the others
}

type SeedFaultCode =
  | 'missing_task_yaml' // a tasks/<id>/ folder with no task.yaml
  | 'bad_id' // an ID outside [a-z0-9-], or longer than 64 characters
  | 'unnamed_step_file' // a .ts file that step.file does not name
  | 'reminder_key' // target: conversation with a key other than name, brief, target, trigger, enabled
  | 'reminder_without_trigger'
  | 'bad_slot' // a slot in instructions.md that the `task` prompt does not accept; trigger.* and inputs.* never are
  | 'poll_trigger' // the trigger holds `poll`
  | 'bad_schedule' // a Schedule key outside its rule
  | 'at_without_offset'
  | 'start_refused'; // checkTaskStart refuses the task.start input
```

```ts
// What the server app passes into the definitions module. It wraps planTaskStart, which the tasks
// module keeps unexported, with the starter and the bounds below.
type CheckTaskStart = (
  input: TaskStartInput,
  starter: 'file' | 'conversation', // 'conversation' for a definition from chat
) => { status: 'planned' } | { status: 'refused'; reasons: string[] };
// 'conversation': the starter and the TaskStartBounds that the conversation's task.start passes.
// 'file': the same TaskStartBounds, with a starter that holds every registered tool, so a file
// definition may list any tool but those of TaskStartBounds.conversationTools.
```

### The hash, the version store and the snapshot

```text
task_definition_versions, one appended migration. nixie never deletes a row.
  definition_hash  text, primary key
  definition_id    text
  form             text, the parsed TaskDefinition as canonical JSON, defaults filled
  files            text, a JSON object of path to exact text: task.yaml, instructions.md, a step file
```

```ts
// definitions module. Replaces `jobs: []` in the snapshot form. Sorted by id.
type SnapshotTasks = Array<
  | { id: string; hash: string; origin: 'definitions' }
  | { id: string; hash: string; origin: 'nixie'; changeID: string } // a runtime definition
>;
```

```ts
const version = await readDefinitionVersion('3f9c…');
// → { definitionID: 'water-the-tomatoes', name: 'Water the tomatoes', brief: 'Read what memory…',
//     instructions: '', model: null, profile: null, persona: 'default', memory: 'read', log: 'own',
//     tools: ['memory.recall'], context: 'fresh', wakeable: false }
//   or null: no row holds the hash

// definitions module. The server app passes it into TasksContext.
type ReadDefinitionVersion = (definitionHash: string) => Promise<DefinitionVersion | null>;

interface DefinitionVersion {
  definitionID: string;
  name: string;
  brief: string;
  instructions: string; // '' when the folder holds no instructions.md
  model: string | null; // null: the model profile of the model role `task`
  profile: string | null;
  persona: TaskPersona; // tasks module, built
  memory: TaskMemory; // tasks module, built
  log: 'own' | 'conversation'; // 'own' unless the definition sets the log grant
  tools: readonly string[];
  context: 'fresh' | 'continuing';
  wakeable: boolean;
}
```

## Constraints

### The folder and the keys

- Under `tasks/`, `isDefinitionsPath` accepts only `.yaml`, `.md` and `.ts` files.
- `definitionsLayout.folders` holds `tasks`, `prompts`, `rules` and `skills`, and `budgets` once
  [budgets](budgets-and-hard-stop.md#budgets-and-the-ledger) ship. nixie reads no `jobs/` folder,
  and the seed record lists it among the skipped root entries.
- `definitionsFormats.tasks` is 4, and a release reads formats 3 and 4. At format 3, nixie loads no
  task definition, and the seed record lists each file under `tasks/` as not applied.
- When a definition omits `model`, its task runs use the model profile of the model role `task`.
- When a definition has `target: task` and no trigger, nixie loads it and binds its task, and never
  opens a task run from a trigger.
- The seed ignores a `runner` key with a warning, as it ignores every field it does not know. Every
  definition runs on the nixie runner, and a `step` key is always on that runner.

### The seed

- nixie checks each definition through `CheckTaskStart`, the one check of a start. The memory tools
  on a task work owns which memory tools a task may hold, and the seed applies that rule only
  through the check.
- When nixie refuses a seed, the definitions of the last accepted seed stay in force.
- A seed is one write transaction. In order: every refusal, the hook that binds each task
  ([the task of a definition](definition-tasks.md#the-seed-hook-and-the-binding)), the hook that
  arms each trigger ([the trigger core](triggers.md#the-arming-hook)), then the `unchanged` return.
  A refused seed calls neither hook, and an `unchanged` seed calls both.
- The parser takes the text of the files as input and never reads the definitions source, so a test
  checks a definition that lives in no repo.

### The hash and the store

- The definition hash covers the parsed `task.yaml` with defaults filled, as canonical JSON; the
  hash of `instructions.md` after `normalizeInstructions`, the persona's normalisation; and the hash
  of the step file.
- A comment in `task.yaml` leaves the hash unchanged. An edit of `instructions.md` changes it.
- When a task run's pinned hash has no row in `task_definition_versions`, the step fails, and after
  `maxStepErrors` failed steps nixie sets the task to `failed`.
- The definitions module imports the tasks module for `TaskStartInput`, and the tasks module imports
  nothing from the definitions module. Module-to-module imports pass the boundary tags, and no
  package the tasks module depends on reaches the definitions module.
- The format adds no port and no config key.
- `destinations` ships with whichever of this work and
  [the decision point cutover](decision-point-cutover.md) lands first. The seed refuses a pattern
  with a space or an empty list item, as the rule parser does. `task.define` refuses the key with
  `FILE_ONLY_KEYS`, so only a file grants a destination.
- `destinations` is part of the parsed `task.yaml`, so the definition hash covers it.
- When `destinations` ships after this format, the release before ignores the key with a warning,
  and keeps the rest of the seed.

### A rollback of the rule format rename

- The release before ignores the `definitions` field of a rules file, because its rule schema knows
  only `jobs`. It logs a warning that names the field, and reads the rest of the rule.
- The release before reads the context `task` as a task that nixie starts from chat, so a rule with
  that context matches no task run of a definition.
- A rule that nixie stored needs no step, because nixie writes it in the old names.

## Decisions

- **Each task run uses the version pinned when it opened.** A seed's edit reaches the next task run,
  never a task run in progress.
  [The trigger source](../platform/channels/trigger-source.md#schedules)
- **A file definition and a runtime definition follow one schema and one store.** Two schemas would
  let chat make a definition that a file cannot hold.
- **One fault refuses the whole seed.** A partial seed would put half an edit in force.
- **`Trigger` lives in the contract lib.** The definitions module imports the triggers module, so
  the triggers module cannot import the type from it.
- **A file definition may list any registered tool.** The owner chose this on 5 Nov and confirmed it
  on 13 Nov. The owner accepts the risk of a task run that nobody watches, so that less code is cut.
- **A file definition still cannot list a tool of `conversationTools`.** An agent's call on 13 Nov,
  which the owner accepted: until the decision point cutover, the fixed rule that allows
  `task.define` and `task.undefine` allows them by name and cannot tell who calls them, so a
  scheduled task run would change definitions.
- **A definition holds no `runner` key.** An agent's call on 13 Nov, which the owner accepted: only
  the nixie runner can start a task, so the key would have one legal value; it arrives with the
  second runner that can start one.
- **The rule format names a definition `definitions`, and its task runs take the context `task`.**
  The owner chose this on 13 Nov. The field `jobs` becomes `definitions`, the context `job` becomes
  `task`, and `call.job` becomes `call.task`, so one rule covers a task that nixie starts and a
  definition's task run. The seed reads both names.
- **A rule that nixie stores keeps the old names for one release.** An agent's call on 13 Nov: the
  release before reads only `jobs` and `job` from `rule_versions`, so a stored rule in the new names
  would stop it starting after a rollback. The release after this one writes the new names.

## Builder decides

- The sentences of each fault. Each fault names its file and its code.
- Where in the seed's transaction nixie stores each version and lays the runtime layer over the
  repo, as long as both come after every refusal and before the 2 hooks.
- Internal names, and the layout of the parser's tests.

## Out of scope

- A `poll` trigger: [mail and calendar polls](mail-and-calendar-polls.md#the-poll-trigger) adds it
  to `Trigger` and drops the `poll_trigger` fault.
- A trigger kind `log`.
- Code that runs a step file.
- A `skills` key: `task.start` takes no skills, so a task run has no way to use a pinned skill.
- The keys `inputs` and `reportFields`.
- A way to start a definition that has no trigger.

## Open questions

None.
