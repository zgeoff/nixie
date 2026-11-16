# Taking notes with a task

Add a daily task to your definitions that reads your messages and saves the facts worth remembering
as memories. The [task definitions](../architecture/core/definitions.md) doc covers how nixie seeds
a task from a folder.

## Before you start

- A checkout of your definitions repo whose `nixie.yaml` holds `format: 4`.

## Steps

1. Copy the 2 files of the example into `tasks/note-taking/` in your definitions repo:
   - [`task.yaml`](examples/note-taking/task.yaml)
   - [`instructions.md`](examples/note-taking/instructions.md)
2. To change when the task starts, edit the `schedule` under `trigger` in `task.yaml`. The example
   starts every day at 21:00 in your time zone.
3. Merge the change and let nixie seed the definitions. Expect a `definitions.seeded` line with
   `status` `seeded` in the operator log. A `status` of `refused` carries an error that holds the
   file's path and the fault.

## What the task does

The task sets `log: conversation`, so it holds the log grant and reads the conversation's thread
with `log.read`. It reads from the start of the previous task run to the start of this task run.

The task tracks no message it has read. When 2 task runs overlap, both can read one message, and a
message can go unread when a task run does not finish.

For each fact worth remembering, the task calls `memory.remember` with your words as the quote and
the event ID of your message. Each save is one memory write with the origin `task`, and the
[write gate](../architecture/memory/writes.md) decides whether it applies or waits as a proposal for
your review. The task lists `memory.edit` as well, to change an item in place.
