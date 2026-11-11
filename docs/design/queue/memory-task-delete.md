# nixie with no built-in memory task

The designed nixie ships no built-in task that writes memory. The conversation and the tasks that
the agent starts are the only writers, through the ordinary memory tools and
[the write gate](memory-write-gate.md). The code holds 2 such tasks, the note-taker and the
consolidator, and a deployment's event log holds what they wrote. This doc covers how the designed
nixie behaves with neither task: what the agent reads, what the config accepts, and how nixie reads
and renders the stored records of the 2 tasks.
[Decision 0050](../../decisions/0050-no-built-in-memory-tasks.md) records the choice. The terms are
in the [glossary](../../glossary.md).

The sketches in `sketches/memory-gate/` hold each type, each flow and the exact text of each
sentence that the agent reads, in lettered sections. This doc holds the rules. Open items are in
[the open list](open/memory-gate.md), each marked here as `(open: <name>)`. The work that takes the
2 tasks out of the code is in [the delete slices](slices/memory-gate-delete.md).

## Terms

- **Note-taker:** the built-in task that saves memories from the conversation in batches.
- **Consolidator:** the built-in task that merges and rewrites memory items once a week.
- **Diff:** the consolidator's one set of proposed changes, which you approve or reject whole or per
  change.
- **Leftover task:** one of the 2 system tasks, `memory-writer` and `memory-consolidator`, in the
  log of a deployment that ran a release with the built-in tasks.
- **Retired prompt ID:** `writer` or `consolidator`, a prompt ID that only stored data holds.

## Built

This section states what the code does. Every section after it states the design.

The note-taker:

- It is the system task with the ID `memory-writer` (`memoryWriterTaskID`). It starts when
  `memory_writer.enabled` is true, wakes per message, and reads batches from a cursor.
- Its tools are `memory.flag-self-note` and staged forms of `memory.recall`, `memory.remember`,
  `memory.edit` and `memory.retire`. Its prompt ID is `writer`. Its model role is `memory-writer`.
- It writes 5 record kinds, which the `memory_writer` projection folds. Its versions and proposals
  carry the origin `memory_writer`.
- The API procedure `memory.writerStatus` reports it. The web client shows a status panel for it,
  and `readRouteSession` uses that procedure as the session probe of 6 routes.
- The session prompt's part `instruction` holds one sentence, which describes the note-taker.

The consolidator:

- It is the system task with the ID `memory-consolidator` (`memoryConsolidatorTaskID`). It starts
  when `memory_consolidation.enabled` is true, and a timer schedules it.
- Its tools are `memory.consolidate` and its own form of `memory.recall`. The conversation holds
  `memory.diff` and `memory.comment`. Its prompt ID is `consolidator`. Its model role is
  `memory-consolidator`.
- It writes 6 record kinds, which 2 projections fold. You answer a diff with the host commands
  `memory-diff`, `memory-diff-approve` and `memory-diff-reject`.
- The API procedure `memory.consolidatorStatus` reports it, with a status panel in the web client.
- The lapse sweep is a process of its own, outside the consolidator's task. It starts with the
  memory store, lapses each pending change of a diff at the change's stored time, and writes each
  lapse record on the thread `memory-consolidator`.

Both tasks:

- The deployment config and `models.roles` are strict objects. Every key of the 2 config sections
  has a default, and the default of each `enabled` is `true`.
- One list, `promptIDs`, is both the prompts that exist and the closed enum that parses stored data.
  4 readers of stored data parse with it.
- `systemSteps` maps 3 system task IDs to steps. A task that the config turns off gets
  `runOffTaskStep`, which empties its inbox, and the server logs `memory_writer.off` or
  `memory_consolidator.off`.

The 11 record kinds are listed in [the sketch of the types](sketches/memory-gate/02-types.ts),
section L.

## Who writes memory

- Only the conversation and a task write memory. A task is one that `task.start` starts, or a task
  run of a task definition. Each write goes through the ordinary memory tools and the write gate.
- The agent consolidates memory by starting a task with the setting `memory: read` and the tools
  `memory.edit` and `memory.retire`. [Memory tools on a task](memory-task-tools.md) owns which tools
  a start accepts.
- Each rewrite or retirement that such a task makes is its own proposal or its own applied version.
  nixie never gathers them in one diff.
- The conversation holds neither `memory.diff` nor `memory.comment`. The host has no `memory-diff`
  command. nixie registers neither `memory.flag-self-note` nor `memory.consolidate`.
- The example definitions for note-taking and consolidation are in
  [the example definitions](example-definitions.md).

## What the agent reads

The agent reads nothing that describes a note-taker. A stored version or proposal that the
note-taker wrote holds the origin `memory_writer`, and nixie never rewrites that value. nixie turns
an origin into a phrase, such as "a task noted it", only when it renders the record for the agent.
The table gives the phrase for the origin `memory_writer` in each place. Phrases:
[the words of each renderer](sketches/memory-gate/02-types.ts), section K.

| Where the agent reads the phrase           | For the origin `memory_writer`    | Grep for                  |
| ------------------------------------------ | --------------------------------- | ------------------------- |
| The session prompt                         | no sentence, and no `instruction` | `sessionPrompt`           |
| A memory item's line                       | no phrase for the origin          | `renderMemoryLine`        |
| A pending proposal, in `memory.pending`    | no phrase for the origin          | `buildPendingTool`        |
| The event line of a proposal's answer      | a neutral phrase                  | `buildProposalAnswerKind` |
| The event line of a merge                  | a neutral phrase                  | `buildProposalMergeKind`  |
| The event line of a stored catch-up record | a neutral phrase                  | `buildCatchUpKind`        |
| The event line of a stored self-note flag  | a neutral phrase                  | `buildSelfNoteFlagKind`   |

- A neutral phrase holds no "note-taker". Its exact text is not written
  `(open: neutral event lines)`.
- The description of `memory.pending` holds no "note-taker".
- nixie never renders "you noted it" for the origin `memory_writer`. The agent did not note the
  item.
- A catch-up record is what the note-taker wrote when it took in messages from before its start. A
  self-note flag record is the note-taker's hint that a message suits a self-note. nixie never
  writes either kind. `buildCatchUpKind` and `buildSelfNoteFlagKind` render only the records of each
  kind that a log holds `(open: stored event kinds)`.
- When the text of an item, or of a message in the log, holds the word "note-taker", nixie renders
  that text as stored. The agent edits or retires such an item with its ordinary memory tools.
- The web review screen labels a version or a proposal by its origin. Which word it shows for the
  origin `memory_writer` is not decided `(open: review screen word)`.

## Stored records of the 2 tasks

- nixie parses each of the 11 record kinds, and the 3 projections fold them, so a rebuild from the
  log gives the same tables.
- Every enum that parses a stored record holds the origin `memory_writer`.
- A pending proposal with the origin `memory_writer` shows in memory review and in `memory.pending`.
  You approve or reject it, and it lapses at its stored time. An approval writes a version with the
  origin `memory_writer`.
- For a version that the note-taker applied, the memory view and the export show the name of the
  model that wrote it. nixie reads that name from the batch record of the version.
- The memory view shows the notice entries that the note-taker's batches wrote. The block of recent
  events in a turn reads the versions that a catch-up wrote.
- nixie never publishes a batch that a log holds as planned and not published.
- nixie has no tool, command or procedure through which you answer a pending diff. The lapse sweep
  lapses each pending change at its stored time, on the thread `memory-consolidator`, and applies
  nothing.
- A version that an approved change wrote has the consolidator's task as its origin, and reads as
  any version `(open: change rows)`.
- The consolidator sealed each diff's summary, and the text of each change, under the key of the
  item it changes. nixie never reads either. A forget of the item destroys that key, so it erases
  both.

## The 2 leftover tasks

A log can hold the 2 leftover tasks, each with inbox records and a due timer. Usage:
[the steps of the 2 leftover tasks](sketches/memory-gate/01-usage.ts), section I. Flow:
[a step of a leftover task](sketches/memory-gate/03-flow.ts), section K.

- `systemSteps` maps each of the 2 task IDs to `runOffTaskStep`. nixie fails every step of a system
  task that has no entry in the map, so both entries exist.
- A step of a leftover task empties the task's inbox and does nothing else. The step never fails,
  and nixie never writes a `memory.*` record in it.
- The task directory lists neither task, so the agent never gets either as a recipient of
  `task.message`. When a message reaches a leftover task's inbox by any other path, the step
  acknowledges the message and writes nothing.
- nixie never creates a leftover task on a log that has none, and never writes a record that closes
  one. A release that holds the built-in tasks would meet such a record after a rollback.

## The config and the manifest

Keys: [the config that nixie refuses](sketches/memory-gate/01-usage.ts), section G.

- When `config.yaml` has the section `memory_writer` or `memory_consolidation`, nixie refuses to
  start and writes nothing. nixie refuses a section with any content, `enabled: false` included.
- When `config.yaml` has `models.roles.memory-writer` or `models.roles.memory-consolidator`, nixie
  refuses to start.
- The strict config schemas give both refusals. nixie has no start check on the 2 tasks.
- `nixie.yaml` is the manifest of your definitions, and the seed is the process that reads it into
  the definitions in force. When the manifest has `prompts.writer` or `prompts.consolidator`, the
  server starts, and the seed refuses the manifest with the status `refused` in the operator log.
  The definitions in force are then those that the last accepted manifest gave.

## Stored prompt IDs

Shape: [the prompt IDs](sketches/memory-gate/02-types.ts), section I. Flow:
[an approval for a retired ID](sketches/memory-gate/03-flow.ts), section L.

- `promptIDs` lists the prompts that exist. It holds no retired prompt ID, so the agent can neither
  read nor propose an override of one.
- `storedPromptIDs` is the closed enum that parses stored data. It holds every member of `promptIDs`
  and the 2 retired prompt IDs. The 4 readers of stored data parse with it.
- A pending proposal for a retired prompt ID shows in the host's pending list. You can reject it,
  and it lapses at its stored time.
- When you approve such a proposal, nixie refuses with one sentence and writes nothing
  `(open: deleted prompt refusal)`.
- nixie reads an override of a retired prompt ID in the stored definitions in force, and never
  renders it.

## The 2 status procedures

- The API contract holds `memory.writerStatus` and `memory.consolidatorStatus`, each with the route
  option `deprecated: true`. Shape: [the status procedures](sketches/memory-gate/02-types.ts),
  section J.
- `memory.writerStatus` returns its status from the `memory_writer` projection, with
  `isEnabled: false`. `memory.consolidatorStatus` returns `isEnabled: false`.
- The web client calls neither. Its session probe is `sessions.list`.
- The API serves both procedures because a browser tab that loaded the web client of a release with
  the built-in tasks uses `memory.writerStatus` as its session probe. The release that takes the 2
  procedures out of the contract is not part of this design.

## A deploy and a rollback

[Decision 0049](../../decisions/0049-milestone-deploys-and-the-rollback-target.md) sets the rule for
a deploy and a rollback. The deploy steps and the rollback step of this work are in
[the delete slices](slices/memory-gate-delete.md).

## Not in scope

- A trigger source that starts a task on each record of the log. The note-taking example runs on a
  schedule.
- A stub config section, a start check on the 2 tasks, and a record that closes either task.
- Host commands that answer a diff, and a web view of a diff.
- A rewrite of stored items, proposals or messages that hold the word "note-taker".
- A change to the write gate.
- Memory triage: a set of tools with which a task sets a proposal aside or rewords it, and a view of
  the result in memory review. A task with the memory write tools does that work through the gate,
  so nixie has no set-aside, no `memory.reword`, no `memory.propose_change`, no reword gate, and no
  triage query, record, view or example definition.
- The example task definitions: see [the example definitions](example-definitions.md).
