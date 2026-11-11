# Memory tools on a task

A task gets a memory tool that writes only when its start names the tool, its starter holds the
tool, and the start sets `memory: read`. nixie has no built-in task that tidies memory, so a task
with the write tools is the one way to file, rewrite or retire memory items outside the
conversation. A worker never holds a memory tool. This doc covers which memory tools each actor
holds. [Decision 0051](../../decisions/0051-memory-tools-on-tasks.md) records the choice. The terms
are in the [glossary](../../glossary.md).

The sketches in `sketches/memory-gate/` hold each type, each flow and the exact text of each
refusal, in lettered sections. This doc holds the rules. Open items are in
[the open list](open/memory-gate.md), each marked here as `(open: <name>)`.

## Built

This section states what the code does. Every section after it states the design, and
[the slices](slices/memory-gate.md) hold the work between the two.

- `planTaskStart` refuses every start that names a memory tool that writes, with the reason
  `memory_write_tools`. `buildTaskStartTool` renders each refusal reason as a sentence.
- `buildTaskStartBounds` in the server sorts the memory module's tools by effect into
  `memoryTools.read` and `memoryTools.write`. A tool with only a read effect is in the first list,
  and every other tool is in the second, `memory.rate` included.
- A start gives the read tools `memory.recall` and `memory.pending` only with `memory: read`. A
  start that names one without it is refused with the reason `memory_tools`.
- A start that names a tool its starter lacks is refused with the reason `wider_tools`.
- The started-tasks architecture doc, in `docs/architecture/core/`, states the built rule.

## What a start accepts

A memory write tool is a tool of the memory module with an effect other than a read. Usage:
[a start that gives a task a memory write tool](sketches/memory-gate/01-usage.ts), section E. Shape:
[the memory tools of a task start](sketches/memory-gate/02-types.ts), section H. Flow:
[the tool check of a start](sketches/memory-gate/03-flow.ts), section J.

- nixie gives a task a memory write tool only when all 3 conditions hold:
  1. the start names the tool in `tools`;
  2. the starter holds the tool;
  3. the start sets `memory: read`.
- When a start names no memory write tool, the task gets none. A start never gives one by default.
- When condition 2 fails, nixie refuses the start. When condition 3 fails, nixie refuses the start.
  Which reason and which sentence each refusal has is not written `(open: start refusal text)`.
  `memory_write_tools` is not a reason.
- Condition 3 exists because a task without `memory: read` gets no memory in its prompt and no
  `memory.recall`. Such a task cannot read the item version that `memory.edit` and `memory.retire`
  take as their target, and would file items blind.
- The memory write tools are `memory.remember`, `memory.edit`, `memory.retire`, `memory.pin`,
  `memory.unpin` and each tool that writes a moment, such as `moment.edit`.
- The server builds the list of memory write tools from the effects of the tools that the memory
  module registers, and from no list of names. `memory.rate` has a write effect, so the list holds
  it wherever the memory module registers that tool.
  [What memory a turn brings](memory-turn-push.md) owns whether the tool exists.
- The tasks module plans the start. The server builds the 2 lists.

## Which actor holds which memory tool

| Tool                   | The conversation | A task                 | A worker |
| ---------------------- | ---------------- | ---------------------- | -------- |
| `memory.recall`        | holds it         | with `memory: read`    | never    |
| `memory.pending`       | holds it         | with `memory: read`    | never    |
| `memory.remember`      | holds it         | under the 3 conditions | never    |
| `memory.edit`          | holds it         | under the 3 conditions | never    |
| `memory.retire`        | holds it         | under the 3 conditions | never    |
| `memory.pin`           | holds it         | under the 3 conditions | never    |
| `memory.unpin`         | holds it         | under the 3 conditions | never    |
| each moment write tool | holds it         | under the 3 conditions | never    |

- The column "A task" covers a task that `task.start` starts and a task run of a task definition.
- A task definition gives the same 2 keys in its file `task.yaml`: `memory` and `tools`. The starter
  of a definition's task run counts as holding every registered tool, so condition 2 always holds
  for it. Conditions 1 and 3 bind it as they bind a started task.
- A worker never holds a memory tool, whatever its caller holds. A worker reads outside text that
  nobody checked. With a read tool, an instruction in that text could make the worker read memory
  out. With a write tool, such an instruction could put a proposal in your review.
  [Task workers](task-workers.md) owns the worker's other tools.
- Only the conversation and a task hold a memory tool.

## What a task's write does

- nixie sends each write from a task through
  [the write gate](memory-write-gate.md#a-write-from-a-task). That section owns every check, and the
  3 ways in which the gate treats a task's write unlike the conversation's.
- An allow rule of yours for a memory tool covers a task's call of that tool as it covers the
  conversation's. The write gate defines the allow rule.
- A task's `memory.unpin` applies at once, as the conversation's does. The write gate has no check
  for an unpin.
- A task with a moment write tool marks moments in its own thread, the record of its own work.

## Not in scope

- A change to the gate's checks.
- A line about memory write tools in the description of the start tool.
- The other limits that a start sets on a task. The docs on tasks own them.
- The `log: conversation` grant, and the gate's read of an event that a granted task cites: see
  [the log grant of a task](task-log-grant.md) and
  [the write gate](memory-write-gate.md#a-quote-that-a-task-with-the-log-grant-cites).
- The labels `gist`, `topic` and `triggers` on a task's `memory.remember`: see
  [memory labels](memory-labels.md). A task's write takes them with no further work on the start.
- A memory tool for the voice channel.
