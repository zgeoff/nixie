# Consolidating memory with a task

Add a weekly task to your definitions that reads your memory items and merges, rewrites or retires
the ones that need it. The [task definitions](../architecture/core/definitions.md) doc covers how
nixie seeds a task from a folder.

## Before you start

- A checkout of your definitions repo whose `nixie.yaml` holds `format: 4`.

## Steps

1. Copy the 2 files of the example into `tasks/memory-consolidation/` in your definitions repo:
   - [`task.yaml`](examples/memory-consolidation/task.yaml)
   - [`instructions.md`](examples/memory-consolidation/instructions.md)
2. To change when the task starts, edit the `schedule` under `trigger` in `task.yaml`. The example
   starts on Sunday at 03:00 in your time zone.
3. Merge the change and let nixie seed the definitions. Expect a `definitions.seeded` line with
   `status` `seeded` in the operator log. A `status` of `refused` carries an error that holds the
   file's path and the fault.

## What the task does

The task starts with fresh context and reads memory. It lists `memory.recall`, `memory.edit` and
`memory.retire`, so it can read items, rewrite them and retire them. A merge is one `memory.edit` on
the item that stays and one `memory.retire` on the other.

Each edit and each retirement is one memory write. The
[write gate](../architecture/memory/writes.md) decides for each write whether it applies or waits as
a proposal for your review.

The definition sets no `log`, so the task reads only its own thread.
