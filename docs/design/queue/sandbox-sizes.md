# The sandbox sizes

nixie asks the sandbox runtime for a fixed amount of memory for each sandbox. In the design, the
conversation's sandbox gets 512 MiB, each system task's sandbox gets 384 MiB, and each fetch's
sandbox gets 192 MiB. The design also puts every figure in one table in the sandbox module, and each
piece of code that creates a sandbox reads its limits from that table. A busy deployment of 1
conversation, 2 system tasks and 4 fetches then asks for 2048 MiB.
[Decision 0054](../../decisions/0054-sandbox-sizes-and-the-memory-kill-signal.md) records the
choice. [The memory-kill signal](memory-kill-signal.md) covers the log line that nixie writes when a
guest uses more memory than its size.

The sketches in `sketches/sandboxes/` hold the code shapes and the exact texts, and this doc holds
the rules. Each `(open: <name>)` mark has an item in [the open list](open/sandboxes.md), which links
the tracker issue.

Terms this doc uses:

- A size is the `SandboxLimits` value of one sandbox: its vCPUs, its memory and its disk.
- A role is what a sandbox is for: the conversation, a system task or a fetch.
- A size row is one entry of the size table: the size for one role. "Row" alone means a size row.
- The sandbox runtime is the service that boots sandboxes. On the imp adapter, each sandbox is an
  imp.
- A system task is the checker or a started task. Both build on `makeSystemTaskRunner`.
- A guest is the system inside one sandbox: its kernel and its processes.
- The harness record is the value that describes one model harness.
  [Model harnesses](model-harnesses.md) owns it and its `sizeRows` field.
- The [glossary](../../glossary.md) holds every other term, such as imp and sandbox kind.

## Built

This section is what the code does. Each section after it is the design.

Three literals in 3 packages hold the sizes:

| Code                                                              | vCPUs | Memory   | Disk     |
| ----------------------------------------------------------------- | ----- | -------- | -------- |
| `startConversation` in the server                                 | 2     | 2048 MiB | 4096 MiB |
| `makeSystemTaskRunner` in the sessions module                     | 1     | 1024 MiB | 4096 MiB |
| the web fetch defaults in the connectors module (`sandboxLimits`) | 1     | 512 MiB  | 4096 MiB |

- A skill fetch takes the size of a web fetch.
- nixie accepts a sandbox spec whose 3 limits are positive whole numbers.
- nixie reuses a sandbox only when the sandbox's stored spec equals the spec that nixie wants.
- When nixie replaces the conversation's sandbox, nixie copies the session into the replacement
  sandbox. When nixie replaces a started task's sandbox, it destroys the sandbox with no copy.
- Each `sandbox.created` record holds its spec's limits as plain numbers.
- The imp adapter passes `memoryMiB` to the sandbox runtime as given.

## The size table

The table is the constant `sandboxSizes`. Shape:
[the size table and its types](sketches/sandboxes/02-types.ts), section A of that file. A usage
example: [how code takes its limits](sketches/sandboxes/01-usage.ts), section A.

The table has 3 rows:

| Row            | Memory  | Sandboxes that take it   |
| -------------- | ------- | ------------------------ |
| `conversation` | 512 MiB | the conversation         |
| `systemTask`   | 384 MiB | each system task         |
| `fetch`        | 192 MiB | each fetch, web or skill |

Each row's vCPUs and disk are the figures of the table under "Built": 2 vCPUs for the conversation,
1 vCPU for the other 2 rows, and 4096 MiB of disk for each.

- A row belongs to a role. A sandbox kind does not pick a row: the worker kind and the checker kind
  both take `systemTask`.
- An image does not pick a row either. The conversation image runs at 512 MiB for the conversation
  and at 384 MiB for a system task.
- In product code, only the file of the table holds a sandbox's memory figure.
- Each `memoryMiB` is an even number, 128 or more. The sandbox runtime's smallest imp is 128 MiB.
  The sandbox runtime boots an odd size on ordinary memory pages, and a host with no memory outside
  its huge-page pool refuses that boot.
- Every size is fixed. nixie asks the sandbox runtime for one amount of memory and for no room above
  it.
- A size is a constant in the code. A release fixes a wrong size. A deployment sets nothing for a
  size, and nixie has no config key for one.
- Each `sandbox.created` record holds the row's figures in its spec.
- The [sandboxes architecture doc](../../architecture/connectors/sandboxes.md) owns the figures once
  the table is built.

### How code takes a size

- When the server starts, it calls `buildSandboxSizes` once, with an empty overrides argument. It
  passes the returned value down as `sizes`, beside the value `images`.
- The code that creates a harness's sandbox calls `getHarnessSize`. That function reads the row name
  for the use from the harness record, and returns `sizes[row]`.
- The fetch tool takes `sizes.fetch`.
- `buildSandboxSizes` throws on an override that is odd or under 128, and its error holds the row's
  name `(open: size refusal text)`.
- The overrides argument is empty in this design, so the throw guards a config key that does not
  exist. If a config key for a size is ever designed, that work adds a config schema and passes one
  argument, and changes no code that takes a size.
- A unit test fails when a row of the table itself is odd or under 128.

### The room a fetch has

- The figures are measured on the imp adapter, where the guest's kernel and the sandbox runtime's
  agent take about 50 MiB.
- The guest of a 192 MiB imp sees 164 MiB of memory in total. The sandbox runtime caps the guest's
  processes at that total less 64 MiB, so the processes of a fetch have 100 MiB.
- The highest measured peak of anonymous memory in a fetch is 68 MiB.
- If a fetch is killed for memory at 192 MiB, the fix is a release that sets the `fetch` row to 256
  MiB.
- The author of a second sandbox adapter with another overhead measures the sizes on that adapter.
  The table then holds one set of rows for each adapter.

## A row for another role

The table has 3 rows in this design, and each row named in this section is outside it. A pull
request that adds a sandbox image for a role with no row also adds the role's row.
[The sandbox image set](sandbox-image-set.md) lists what such a pull request holds.

- The author of that pull request takes the row's size from a probe, run on the image that the role
  runs. The probe script is in the memory spike, under `research/sandbox-memory`. The pull request's
  description holds the probe's output.
- One row starts at an estimate: `codexTask`, the row for a task on the Codex harness, at 384 MiB
  `(open: codex row estimate)`. The author of the pull request that adds the Codex image runs
  [the Codex probe](sketches/sandboxes/01-usage.ts), section D, on a test imp. If the probe shows a
  memory kill, the author raises the row by an even number, runs the probe again, and puts the
  output of the size that passed in the description.
- nixie offers the Codex harness as a selectable entry only in a release whose Codex probe passed.
- A worker takes the `systemTask` row. The author of the worker image adds a `worker` row once a
  probe gives a figure for it. [Task workers](task-workers.md) owns the worker and its sandbox.
- A headless browser does not fit the `fetch` row. A row for a browser fetch holds 512 MiB until a
  probe shows that less is enough.
- The figures and what backs each one:
  [the rows that arrive with an image](sketches/sandboxes/02-types.ts), section A.

## A sandbox whose size differs from its row

A size is part of a sandbox's spec. So the reuse rule under "Built" replaces each sandbox whose
stored size differs from its row. nixie replaces it the first time nixie uses that sandbox after a
start. Flow: [reuse or replace](sketches/sandboxes/03-flow.ts), section A.

- For the conversation, nixie creates a sandbox at the row's size, copies the session into it, and
  destroys the sandbox it replaces.
- For a started task that is open, nixie destroys the sandbox at the task's next step and creates
  one at the row's size. The guest opens a session from the task's records in the event log.
- For a fetch, nixie replaces nothing, because each fetch creates its own sandbox.
- The rule holds for an upgrade and for a rollback between 2 releases with different tables. After
  the first start of either release, nixie replaces each sandbox once. Each release can read the
  spec that the other stored, because the limits are plain numbers.

## Not in scope

- A config key for a size.
- A change to the vCPUs or the disk of any sandbox.
- One imp shared by several pieces of work. Each conversation, system task and fetch has its own
  imp.
- A row or a measurement for the memory writer and the memory consolidator, the 2 built-in tasks
  that also build on `makeSystemTaskRunner`.
- Every step on a host: the host's huge-page pool, the developer imps, and the read of the sandbox
  runtime's log. Those belong to a deployment's own delivery, outside this repo.
