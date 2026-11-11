# 0053: Workers

- Date: 2026-11-11
- Status: decided

## Decision

A worker is a function behind one tool, `worker.run({ question, tools })`, and no kind of task. The
call creates a sandbox for the worker alone and runs one fresh session in it. The worker is gone
when the call returns, and a worker run is not durable.

1. **Its tools are the names its caller passes.** Each is a tool the caller holds. A worker never
   holds a tool that starts a task, sends a message or runs another worker, and it holds no memory
   tool, under [0051](0051-memory-tools-on-tasks.md).
2. **4 limits.** A worker run stops at the first of its limits on minutes, turns, tokens and
   dollars.
3. **One dollar limit.** A worker run's dollars count toward the dollar limit of the task that
   called it.

## Why

- A worker adds 2 things over a task: its caller gets the answer in the same turn, and the outside
  text that the worker read never enters the caller's context.
- A worker lives inside one tool call, so it needs no lease, inbox, state or report.
- A tool list that the caller passes never widens what the caller can do.
- You gave the calling task its dollar limit, so the worker spends from it.

## Rejected alternatives

| Option                   | Why not                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| a worker as a small task | it needs a second task machinery, with a durable life, for work that ends with one call |
| a fixed tool set         | it either holds a tool that the caller lacks or lacks the tool that the question needs  |
| a separate worker budget | a task could spend past its own dollar limit through its workers                        |

## Consequences

- A step that starts again starts a new worker.
- The outside-session runner, which runs a coding session as a task, is a task runner, not a worker,
  and gets a separate, later design.
