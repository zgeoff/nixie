# The example definitions: files

The files of the 3 example definitions that [the example definitions](../../example-definitions.md)
describe. This file holds the shapes, and the doc holds the rules. A place marked `(open: <name>)`
is not settled: see [the open list](../../open/definitions.md).

Each `task.yaml` uses only keys of the `task.yaml` schema, spelled as the schema spells them. Each
sets no `role` and no `target`, so the target is `task`. The schedule values in all 3 files are
examples (open: example schedule values): any value that the `Schedule` rules accept works. The
`name` and `brief` values are this file's own (open: example name and brief).

## A. Note-taking

`docs/guides/examples/note-taking/task.yaml`:

```yaml
# The schedule's values are an example. Pick any that the Schedule rules accept.
name: Take notes
brief: Read the conversation since the previous task run and save what is worth remembering.
trigger:
  schedule:
    every: day
    at: '21:00'
context: fresh
memory: read
log: conversation
tools:
  - log.read
  - memory.remember
  - memory.edit
```

`docs/guides/examples/note-taking/instructions.md` tells the task to do 2 things. The exact text is
not written (open: example instructions text).

- Read your messages on the conversation's thread since its previous task run, through `log.read`
  (open: previous start block).
- Save each memory with a typed quote and the event ID of the message it comes from.

## B. Memory consolidation

`docs/guides/examples/memory-consolidation/task.yaml`:

```yaml
# The day and the time are an example.
name: Tidy memory
brief: Read the memory items and merge, rewrite or retire the ones that need it.
trigger:
  schedule:
    every: week
    on: sun
    at: '03:00'
context: fresh
memory: read
tools:
  - memory.recall
  - memory.edit
  - memory.retire
```

The file sets no `log`, so its task reads its own thread.

`docs/guides/examples/memory-consolidation/instructions.md` tells the task to do 2 things. The exact
text is not written (open: example instructions text).

- Read the items with `memory.recall`.
- Merge, rewrite or retire items with `memory.edit` and `memory.retire`.

## C. Moment reflection

`docs/guides/examples/moment-reflection/task.yaml`:

```yaml
# The schedule's values are an example.
name: Reflect on moments
brief: Write a reflection on each kept moment that has none, at most 3 in a task run.
trigger:
  schedule:
    every: day
    at: '04:00'
context: fresh
memory: read
log: conversation
tools:
  - moment.find
  - moment.read
  - moment.edit
  - log.read
maxCalls:
  moment.edit: 3
```

`docs/guides/examples/moment-reflection/instructions.md` tells the task to do 4 things. The exact
text is not written (open: example instructions text).

- Find the kept moments that hold no reflection with `moment.find`.
- Reflect on at most 3 moments in a task run, oldest keep first.
- Read each moment's span through `moment.read`, and the conversation around it through `log.read`.
- Write a reflection, and change nothing else on a moment.
