# 0051: Memory tools on tasks

- Date: 2026-11-11
- Status: decided
- Design: [which memory tools a task holds](../design/queue/memory-task-tools.md),
  [the log grant](../design/queue/task-log-grant.md)

A task start accepts every memory tool that is not read-only: `memory.remember`, `memory.edit`,
`memory.retire`, `memory.pin`, `memory.unpin` and the moment write tools (GEO-2519).

These choices settle memory on a task:

1. **A write tool needs `memory: read`.** A start that names a memory write tool without it is
   refused.
2. **The same gate.** Each write from a task passes the same gate as a write from the conversation.
3. **No self-note.** The gate still refuses a new self-note from a task.
4. **No memory tool on a worker.** A worker holds none, whatever its caller holds.
5. **The log by grant.** A task reads the conversation's thread of the event log only by a grant on
   that task: `log: own`, the default, or `log: conversation`, on `task.start` and in a task
   definition (GEO-2525). A start never refuses the grant because the task also holds a tool with an
   outside destination.

## Why

- Under [0050](0050-no-built-in-memory-tasks.md) no built-in task tidies memory, so a task with the
  write tools is the one way to do it outside the conversation.
- A task without `memory: read` cannot read the version that an edit needs, and would file items
  blind.
- A self-note is the agent's own voice, and that voice is in the conversation.
- A worker reads outside text that nobody checked. A read tool would give that text a way to
  memory's contents, and a write tool a way to a proposal.

## Alternatives

- **Three tools only: remember, edit and retire.** Moment reflection could not run as a task, and
  [0037](0037-moments.md) says that a task keeps a moment from its own work.
- **A refusal of the grant beside a tool with an outside destination.** The refusal would have to be
  removed later, so it is never added.

## Consequences

- The example definitions of 0050 name their memory tools and set `memory: read`, and the
  note-taking and moment reflection examples set `log: conversation`.
- Your rules on `memory_write` under [0048](0048-one-approval-system.md) decide a task's write as
  they decide the conversation's.
