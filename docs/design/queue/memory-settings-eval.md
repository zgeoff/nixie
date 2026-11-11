# The eval of memory settings (parked)

The eval of memory settings is parked: nixie does not build it, and nobody designs it, until a task
runner for it exists and you, the person nixie works for, answer the choices in
[the open list](open/memory-gate.md). In an eval, the agent scores 2 sets of values for its own
memory settings on the same data. This doc holds only the rules that any design of it must meet. The
terms are in the [glossary](../../glossary.md).

The other docs of the memory gate work point at TypeScript sketches in `sketches/memory-gate/`. The
eval has no shape yet, so those sketches hold nothing for it.

## What exists that an eval could use

- A spike in `research/memory-retrieval/` scores memory retrieval offline. It reads a memory export,
  the file that holds a copy of the memory items, and it reports totals and averages over all turns,
  never one turn or one item.
- The agent rates recalled items with the tool `memory.rate`, and nixie writes one `memory.rated`
  record to the event log for each rating.

## The settings an eval compares

- An eval compares 2 sets of values for these config keys: `index_tokens`, `index_fold_order`,
  `index_item_order`, `trigger_min_score` and `trigger_items`.
- The first 3 keys shape the memory index, the list of memory that opens a session:
  [the memory index](memory-index.md) owns them.
- The last 2 keys decide which items nixie places in a turn when a message matches an item's
  trigger: [what memory a turn brings](memory-turn-push.md) owns them.

## The rules for any eval

- An eval never sends a turn to a production deployment, and never writes to the memory store.
- An eval reads one fixed copy of the data, so nixie scores both sets of values on the same data.
- An eval reads the agent's memory and your messages. The eval never copies personal data that a
  person or a model can read to a host that you do not control.
- A report of an eval gives totals and averages only.
- The only ratings an eval has are the `memory.rated` records that the event log holds. (open: eval
  ratings source)
- An eval starts as a task, through the interface that every task runner implements:
  [the task runner port](task-runner-port.md). The eval does not add an interface of its own for how
  it starts.
- The memory export is the eval's one source of memory items, so the eval does not add an interface
  for its data. Whether the export holds the `memory.rated` records is not stated
  `(open: eval data place)`.

## What is open

You decide every other part of the design. The 5 choices are whether to design the eval at all, what
starts an eval, what stops the agent from tuning the settings to ratings that it gave itself, who
changes a setting after an eval, and where the eval reads and writes. Each is in
[the open list](open/memory-gate.md) with its options and its tracker issue, under a name that
starts with `eval`.

## Not in scope

- Any build of the eval.
- The task runner that the eval waits for: see [the task runner port](task-runner-port.md).
- A score of the memory index outside an eval. The offline spike has no mode for the index.
