# The task runner port

This doc covers the task runner port: the interface between the part of a task that nixie owns and
the runner, the code that does the task's work. Each runner declares itself in a runner definition,
and one function finds the runner of a task. With the port, a second kind of runner can exist
without a change to the code that claims steps or to another runner. [Port rules](port-rules.md)
gives the rules for any port.

This doc holds the rules. The sketches are the TypeScript files in `sketches/tasks/`: they hold the
type definitions, and each section here links the part it uses. Terms that this doc does not define
are in the [glossary](../../glossary.md) and in the Terms section of
[task runs](task-runs-and-reports.md), which defines step, claim, started task, limit hold and
report mode. An item marked `(open: <name>)` is not settled. [The open list](open/tasks.md) gives
each item by that name.

## Terms

- The **task envelope** is the part of a task that nixie owns: its state, inbox, lease, limits and
  report.
- A **runner** is the code that does the work of a task's steps. A runner implements the function
  type `RunStep`, and nixie calls it once per step.
- The **nixie runner** is the runner that runs a model in a sandbox.
- A **runner definition** is what a runner declares about itself: a value of the type
  `TaskRunnerDefinition`. Its **key** is the runner's name in stored records, such as `nixie`.
- A **task definition** is a task that your definitions declare, and a **definition's task** is the
  one task that runs it. A **definition version** is one stored version of a task definition.
  [Task definitions](task-definitions.md) describes all 3.
- A **fixed task** is a task that exists without a `task.start` call and without a task definition,
  such as the conversation.
- A **control** is a command of yours on a task, such as stop, close or raise.
- A **start variant** is the input shape of `task.start` for one runner.
- The **registry** is the value that `buildTaskRunnerRegistry` returns from the runner definitions.
  It finds the runner of a task.
- A **leftover task** is one of the tasks `memory-writer` and `memory-consolidator` in a log that
  has them. [The delete of the built-in memory tasks](memory-task-delete.md) describes them.
- A **sandbox owner** is the ID that a sandbox is created under. For a task's sandbox, it is the
  task ID.
- **Recovery** is what nixie does at server start after a crash:
  [leases and recovery](../../architecture/core/leases-and-recovery.md). The **checker** is the
  model that checks a proposed write or action. It is not a task, and it has a sandbox.

## Built

This section describes the code as it is before this design is built. Where a section after it
differs, the design replaces the built behaviour.

- The function type `RunStep` is the one interface between the task envelope and the code that runs
  a step. It takes a `StepInput` and returns a `StepResult`.
- `startTaskRunners` splits claims into 2 groups, started tasks and all other tasks. Each group has
  its own claim pool.
- The server picks the `RunStep` of a task by task ID. The conversation has its own. The tasks
  `memory-writer` and `memory-consolidator` each have their own. Every started task gets the nixie
  runner. Any other task gets the unknown-task step, which rejects every step, or the test step in a
  test build.
- The queue check is the fixed task `queue-check`, which runs no model. A wrapper in the server
  picks its `RunStep`.
- `makeSystemTaskRunner` is a factory that resolves the profile, the image and the command of a
  model role. The checker and the nixie runner use it.
- Recovery destroys leftover sandboxes. It spares the sandboxes of the conversation, of the 2 memory
  tasks, of the checker and of every open started task.
- The API's task procedures give every listed task the controls of the nixie runner.
- `planTaskStart` is the one check of a start. `task.created` stores the `options` of a start.
- `readTaskSetup` returns the starter, the options and the limits of a started task, or null.

## The port

The tasks module calls a runner, so the tasks module owns the types of the port. Usage: section J of
[the usage sketch](sketches/tasks/01-usage.ts). Types: section P of
[the types sketch](sketches/tasks/02-types.ts).

- A runner implements `RunStep`. nixie calls it with a `StepInput` and receives a `StepResult`.
- `StepInput.run` and `StepResult.run` carry the task run: [task runs](task-runs-and-reports.md).
- For every runner, nixie owns the task envelope.
- A runner never writes a task's state, a task run record or the limit hold.
- The code outside a runner never branches on the key of a runner.
- The port is `RunStep` and the runner definition, and it has no other member. The runners of this
  design need no other member.
- A worker is not a runner, and the port does not cover workers: [task workers](task-workers.md).
- The task report and the message envelope have no port, because each has one format.
- `makeSystemTaskRunner` is a factory and not a port.

## The runner definitions

The design has 5 runner definitions:

| Runner definition                  | Key   | Fixed tasks           | Start variant | What its step does        |
| ---------------------------------- | ----- | --------------------- | ------------- | ------------------------- |
| the conversation                   | open  | the conversation      | none          | runs a conversation turn  |
| the nixie runner                   | nixie | none                  | `nixie`       | runs a model in a sandbox |
| the queue check                    | open  | `queue-check`         | none          | checks the action queue   |
| the leftover `memory-writer`       | open  | `memory-writer`       | none          | empties the task's inbox  |
| the leftover `memory-consolidator` | open  | `memory-consolidator` | none          | empties the task's inbox  |

- The keys marked open and the controls of each runner definition are not written. (open: runner
  definition values)
- The nixie runner runs every started task and every task run of a task definition. It is the
  default runner.
- `planTaskStart` is the `plan` function of the `nixie` start variant.
- Each leftover task has a runner definition of its own, with `keepsSandboxes: false`. A leftover
  task runs no model, has no sandbox and cannot call a worker.
- The unknown-task step and the test step have no runner definition. One of them is the `fallback`
  argument of the registry's `bindSteps`: the test step in a test build, and the unknown-task step
  in every other build.
- The checker has no runner definition, because it is not a task.
- The server builds the runner definitions and the registry before a runner starts. It passes the
  `RunStep` of each runner to `bindSteps`, beside the runner definition.
- The server refuses to start when 2 runner definitions have the same key or the same fixed task.
- The server refuses to start when a runner definition has no `RunStep`, or a `RunStep` has no
  runner definition.

## Finding the runner of a task

`resolve`, a function of the registry, is the only code that finds the runner definition of a task.
Flow: section J of [the flow sketch](sketches/tasks/03-flow.ts).

`resolve` returns the first of these that applies:

1. For a fixed task: the runner definition that has the task in its fixed tasks.
2. For a task whose `task.created` record has a `runner` key: the runner definition with that key.
3. For a definition's task: the runner definition that its definition version asks for.
4. For any other started task or definition's task: the default runner.
5. For any other task: null. The `fallback` step then runs.

- Step 3 depends on a `runner` key of a task definition, which is not settled: see "runner key" in
  [the definitions open list](open/definitions.md).
- One statement of the design gives `resolve` only steps 1, 2 and 4. (open: runner lookup order)
- When a stored `runner` key matches no runner definition, the step throws. The task then fails at
  its error limit, as with any step that throws. nixie never guesses a runner.
- 4 callers use `resolve`: the code that runs a claimed step, the check of a control, the `controls`
  of a listed task, and the `runner` filter of `tasks.list`.
- `bindSteps` returns one `RunStep` that calls `resolve` and then the `RunStep` of that runner. Both
  claim pools run it, so the code that claims steps is the same for every runner.

## What nixie stores for a start

- `task.created` carries 3 optional keys: `runner`, `envelope` and `runnerOptions`.
- A start on the nixie runner writes `runner: 'nixie'` and the `options` of the start.
- A start on any other runner writes `runner`, `envelope` and `runnerOptions`. `envelope` carries
  the report mode and the limits. `runnerOptions` carries what the `plan` function of that runner
  returned.
- `readTaskSetup` is the one function that reads what a task was set up with. It returns one of 3
  forms: for a started task, for a definition's task, and for a fixed task.
- For a started task, `readTaskSetup` returns the report mode and the limits, whichever of `options`
  and `envelope` has them. Its callers never read the key of the runner.
- For a definition's task, `readTaskSetup` returns the ID of the task definition and the hash of the
  definition version in force. The report mode and the limits of a definition's task belong to each
  task run.
- The code outside a runner never reads `runnerOptions`. The runner reads it through the
  `parseOptions` function of its runner definition.
- When `parseOptions` throws, the step fails and nixie retries it, as with any step that throws.

## `task.start`

- When one runner has a start variant, the input of `task.start` is that start variant.
- When more than one runner has a start variant, the input of `task.start` is a `oneOf` over the
  start variants.
- A start variant is part of the input only in a deployment that configures its runner.
- `parseTaskStartInput` reads the `runner` key of an input, finds the runner definition and parses
  the input with the schema of its start variant.
- 3 callers use `parseTaskStartInput`: the `task.start` tool, the seed of a task definition, and the
  tool `task.define`.
- Each start variant has its own effect declaration. When nixie decides whether a `task.start` call
  needs your approval, it uses the effect declaration of the start variant in the call, under the
  tool name `task.start/<key>`, where `<key>` is the key of the runner.
- When the `plan` function of a start variant refuses a start, the error of the tool is the sentence
  that `plan` returned.

## Controls and recovery

- `planTaskControl` receives the `controls` of the runner definition of the task. It refuses a
  control that is not among them, with the reply reason `runner_lacks_control`.
- nixie never stores `runner_lacks_control` in a record.
- At recovery, nixie spares the sandboxes of 2 sets of sandbox owners: the checker, and the sandbox
  owners that `readKeptSandboxOwners` returns.
- `readKeptSandboxOwners` returns the fixed tasks of each runner definition with
  `keepsSandboxes: true`, and each open task whose stored `runner` key is the key of such a runner
  definition.
- In the API contract, a listed task carries `runner`, the task list accepts a `runner` filter, and
  the reply to a control can carry `runner_lacks_control`.

## Not in scope

The design has none of these:

- A runner that runs a coding session outside nixie as a task. The comment at the end of section P
  of [the types sketch](sketches/tasks/02-types.ts) records what such a runner would add.
- A function on the port that nixie calls when a task stops or closes, and a declared list of the
  limits that a runner can count.
- A runner object with more functions than `RunStep`.
- A runner definition for a task that runs no step.
- One shared parser for the stored options of every runner.
