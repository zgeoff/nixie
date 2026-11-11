# Task definitions from chat

The agent creates, alters and deletes a task definition from the conversation with 2 tools, and
reads the definitions with a third. nixie puts each such change in force at once, as a layer over
the definitions repo, and writes a notice with an undo for it.

The sketches hold the shapes and the texts that exist, and this doc holds the rules. An item marked
`(open: <name>)` is not settled, and [the open list](open/definitions.md) holds it. The
[glossary](../../glossary.md) defines conversation, tool, effect, rule, notice, record, projection
and definitions source.

Terms from other docs:

- [Task definitions](task-definitions.md) defines task definition, definition ID, definition hash,
  seed and in force.
- [Task runs of a definition](definition-task-runs.md) defines fire and dedupe key.
- [Schedules](schedules-and-triggers.md) defines one-shot.

Terms this doc adds:

- **Definitions repo.** The git repo that the definitions source reads.
- **Define.** Create a task definition, or alter one. `task.define` does both.
- **Undefine.** Delete a task definition. `task.undefine` does it.
- **Runtime change.** One define, one undefine or one undo of one task definition, made outside the
  definitions repo.
- **Runtime layer.** The runtime changes in force, laid over the definitions of the repo.
- **Runtime definition.** A definition version that a runtime change holds.
- **Previous version.** The version of a definition that was in force just before a runtime change.
- **Head.** The most recent runtime change of one definition.
- **File-only key.** A key of `task.yaml` that `task.define` cannot set.
- **Fold.** The code that writes one record into a projection.

Related docs:

- [Undo and the export](definition-undo-and-export.md) covers the undo, the export of a runtime
  change to the definitions repo, adoption and conflicts.
- [The definition views](definition-views.md) covers the web client's list of definitions.

## Built

This section lists the built code that the design uses.

- `buildRuntimeOverlay` lays runtime changes over seeded definitions, for rules and for skills. It
  is generic over its seeded type and its change type.
- `canMoveRuntimeChange` holds the table of allowed moves between the values of
  `RuntimeChangeState`.
- The decision point is the code that allows or denies each tool call. Its rule `slice1.read-only`
  allows only the effects `read`, `fetch` and `note`.
- `schedule` is one of the effects that a tool can declare.
- `getFixedRules` returns the fixed rules, which the decision point tries before `slice1.read-only`.
  `slice1.queue-check` is one of them.
- `planTaskStart` checks a `task.start` call against its starter, the caller of the tool.
- nixie has one writer, and the writer holds one write transaction at a time.

## The 3 tools

Inputs and outputs are in [the chat tools](sketches/definitions/02-types.ts), section I. Example
calls are in [the conversation defines a task](sketches/definitions/01-usage.ts), section E.

| Tool                | What it does                | Effect     | Held by          |
| ------------------- | --------------------------- | ---------- | ---------------- |
| `task.define`       | Defines a task definition   | `schedule` | the conversation |
| `task.undefine`     | Undefines a task definition | `schedule` | the conversation |
| `tasks.definitions` | Lists the task definitions  | `read`     | the conversation |

- A task does not hold `task.define` or `task.undefine`.
- One fixed rule of the decision point allows `task.define` and `task.undefine` when the caller is
  the conversation. `getFixedRules` returns it, so the decision point tries it before
  `slice1.read-only`.
- The fixed rule does not alter the declared effect. A rule that matches on the effect `schedule`
  matches both tools.
- The tools spell their ID members `definitionId` and `changeId`. The records and the API spell them
  `definitionID` and `changeID` (open: ID casing).

## What `task.define` accepts

Each refusal has a code, listed in [`DefinitionRefusal`](sketches/definitions/02-types.ts), section
L. The sketches hold no refusal sentence (open: refusal text).

- `task.define` takes a `schedule` trigger or an `at` trigger.
- When the agent passes no `definitionId`, nixie creates a definition. Its definition ID is the slug
  of `name`. When a definition has that ID, nixie refuses with `ID_TAKEN`.
- When the agent passes a `definitionId`, nixie alters that definition. The runtime change holds the
  previous version, so an undo can restore it.
- When the agent passes an `at` without an offset, nixie reads the time in your zone. nixie stores
  the time with the offset.
- nixie parses the input with the definition schema of [task definitions](task-definitions.md). A
  runtime definition and a file follow one schema.
- nixie checks the input through `planTaskStart`, with the conversation as the starter. A runtime
  definition holds only tools, memory settings and limits that a `task.start` call from the
  conversation can hold.
- The file-only keys are `context`, `wakeable`, `maxCalls`, `step`, `reportShape` and `log`.
  `task.define` sets none of them.
- A runtime definition has no `log` key, so its task reads only its own thread.
- When the agent passes the `definitionId` of a definition that holds a file-only key at a value
  other than its default, nixie refuses with `FILE_ONLY_KEYS`. The agent therefore cannot copy a
  `step` or a `maxCalls` from a file into a runtime definition.
- When the agent defines a one-shot for a definition that the definitions repo holds, nixie refuses
  with `ONE_SHOT_OVER_REPO`.

## The rendered schedule

Example outputs are in [the rendering function](sketches/definitions/02-types.ts), section H.

- One pure function of the triggers module renders a trigger in plain words, and gives the time of
  its next fire. It sits beside `readNextFire`.
- The function renders in the schedule's zone.
- The function has 4 callers: the result of `task.define`, the notice, `tasks.definitions` and the
  web client's list of definitions.
- nixie does not store the rendered text or the next fire on a record. A stored next fire is wrong
  as soon as the clock passes it.

## The change records

Shapes are in [the 5 change records](sketches/definitions/02-types.ts), section J.

| Record                         | When nixie writes it                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `definition.changed`           | At each define, each undefine and each undo                  |
| `definition.settled`           | A runtime change goes out of force and no change replaces it |
| `definition.repo_moved`        | A seed finds another repo version under a runtime change     |
| `definition.conflict_resolved` | You resolve a conflict                                       |
| `definition.export_moved`      | An export goes from one state to another                     |

- `definition.changed` sits on the conversation's thread. The other 4 records have no thread.
- nixie writes `definition.changed` in the transaction that puts the runtime change in force. Every
  runtime change in force therefore has a notice.
- `definition.changed` holds a random change ID and a short ID from `createShortID`. The model reads
  the short ID, and the notice shows it.
- `definition.changed` has one erasable field, `version`. An erasable field is a part of a record
  that nixie encrypts under a key it can destroy.
- `version` holds the runtime definition: its parsed form and the exact text of its files.
- The web client renders `definition.changed` as a notice with an undo control.
- The sketch holds the notice text of a created definition only (open: notice text).
- nixie writes the notice for every define, whether or not a message of yours asked for the
  definition. nixie does not ask for an approval.
- [Undo and the export](definition-undo-and-export.md) covers what `definition.settled`,
  `definition.repo_moved`, `definition.conflict_resolved` and `definition.export_moved` mean.

## The runtime layer

Tables are in [the 2 projections](sketches/definitions/02-types.ts), section K. The reads are in
[the 2 layers](sketches/definitions/03-flow.ts), section L.

- `runtime_task_definitions` holds one row per runtime change.
- `task_definition_exports` holds one row per export.
- Both tables are projections.
- A unique index covers `short_id`.
- A unique index covers `definition_id` where the state is `in_force`. One definition therefore has
  at most one runtime change in force. A second one fails the index, and the transaction fails with
  it.
- Each fold reads its record and the rows that the record points at. It reads no other table.
- The fold of `definition.changed` stores `version` under its hash in `task_definition_versions`,
  unless the table holds that hash.
- nixie stores no table of the definitions in force across the repo and the runtime layer. It
  computes the answer at each read: it lays the runtime changes in force over the repo's definitions
  through `buildRuntimeOverlay`.
- The runtime change of an undefine holds a null hash. When such a change is in force, the
  definition is out of force, also when the repo holds a version of it.
- The head of a definition is its runtime change with the greatest `changed_sequence`.
- The first state of a runtime change is `in_force`. A runtime change moves once from `in_force`, to
  `superseded`, `adopted` or `retired`. `canMoveRuntimeChange` holds the allowed moves.
- `superseded` means that a runtime change of the same definition replaced it.
  [Undo and the export](definition-undo-and-export.md) covers `adopted` and `retired`.

## One runtime change, in one write transaction

The steps as code are in [a change from chat](sketches/definitions/03-flow.ts), section I. The
functions are in [the definitions module](sketches/definitions/02-types.ts), section L.

`task.define` and `task.undefine` call `requestDefinitionChange`. It does these steps:

1. For an undefine, nixie first runs a seed of the definitions source, outside the write
   transaction. When that seed is refused or fails, nixie goes on to step 2.
2. For a define, nixie builds the version. It parses the version and checks it through
   `planTaskStart`.
3. nixie opens one write transaction. It reads the state of the definition and calls
   `pickDefinitionMove`.
4. When `pickDefinitionMove` returns a refusal, nixie writes no record and returns the refusal.
5. Otherwise nixie writes `definition.changed`. The fold marks the runtime change that was in force
   as `superseded`. It inserts this runtime change as `in_force`.
6. In the same transaction, nixie runs `seedInForceInTransaction`. That seed writes the seed record.
   It then calls the 2 seed hooks, which [the task of a definition](definition-tasks.md) and
   [the trigger core](trigger-core.md) cover. The hooks bind the definition's task and arm its
   trigger.
7. nixie commits. It then wakes the export. The tool call does not wait for the export.

- Step 1 exists because you can merge a pull request into the definitions repo at any time. The seed
  reads that merge before nixie decides the undefine.
- `pickDefinitionMove` is pure. It is the one function that decides a define, an undefine and an
  undo. The sketches declare some of its types nowhere (open: undefined types).
- `requestDefinitionChange` takes the list `holders`: the kinds of caller that can hold the 2 tools.
  `holders` contains the conversation alone.
- The `caller` member of `definition.changed` can hold a task. The record therefore also fits a
  deployment whose `holders` contains tasks.
- When any step throws, the transaction rolls back. nixie has then written no notice, no runtime
  change and no armed trigger.
- A fire that nixie wrote before a runtime change, and that the task has not read, uses the
  definition version that the fire holds. The runtime change does not alter that task run.
- [Schedules](schedules-and-triggers.md) covers how a runtime one-shot goes out of force after its
  one fire.

## Boundaries

- The definitions module owns the 5 records, the 2 projections of the runtime layer and the
  functions of this doc.
- The server app passes 4 things into the definitions module: the check of a start, the seed of the
  definitions source, `holders` and `branchOf`. [Undo and the export](definition-undo-and-export.md)
  covers `branchOf`.
- Definitions from chat add no config key.

## Not in scope

- A definition that a task proposes. That needs a decision point that asks you for an approval,
  which is not built.
- `poll` triggers from chat.
- The file-only keys on `task.define`.
- A write to the definitions source by nixie.
- A check of the previous hash when the agent alters a definition, such as an `expectedHash` input.
