# Memory gate: the task tools, the gate and the eval as slices

These are slices 5 to 8 of the memory gate family. Slices 1 to 4 are in
[the delete slices](memory-gate-delete.md). The docs are
[memory tools on a task](../memory-task-tools.md), [the write gate](../memory-write-gate.md),
[the gate's checks on labels](../memory-write-gate-labels.md) and
[the eval of memory settings](../memory-settings-eval.md). The sketches are in
`../sketches/memory-gate/`. Open items are in [the open list](../open/memory-gate.md).

Each "Needs" line is a settled dependency. Run `bun run models && bun run test:bundles` once before
the unit tests of a slice. Tests are in the unit lane unless marked. Invent every text.

Slices 2, 6 and 7 each change the gate's code for `memory.remember` and `memory.edit`. They land in
that order, one milestone apart. Between any 2 of them the gate runs every check of the slices that
landed, and the conversation's writes pass and wait as they did.

Each slice has the ID `memory-gate-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `memory-gate-n`.
[The work list](../work-list.md) gives the build order.

### memory-gate-5. A task start accepts the memory write tools

[The memory write tools issue](https://linear.app/zgeoff/issue/GEO-2519).

- **Outcome:** A start with `memory: read` gives a task each memory write tool that the start names
  and its starter holds. The reason `memory_write_tools` is gone from the code. The started-tasks
  architecture doc states the 3 conditions.
- **Follows:** every design section of memory tools on a task; `01-usage.ts`, section E;
  `02-types.ts`, section H; `03-flow.ts`, section J.
- **Needs:** nothing. The text (open: start refusal text): the 2 refusal checks rest on it. It lands
  in the milestone of memory-gate-4. It conflicts with no slice of the memory index family.
- **Changes:** `planTaskStart` and `buildTaskStartTool` in the tasks module, `buildTaskStartBounds`
  in the server, and `docs/architecture/core/started-tasks.md`: remove the sentence that a start may
  name no memory tool that writes, and state the 3 conditions.
- **Check:**
  - `bun test modules/tasks apps/server`: a start with `memory.edit` and `memory: read` plans; a
    start with `moment.edit` and `memory: read` plans; a start that names a write tool its starter
    lacks is refused; a start that names a write tool without `memory: read` is refused. The
    sentence of each refusal is not a gate while (open: start refusal text) is open.
  - `bun run test:e2e` (e2e): a spawned nixie starts a task with `memory: read` and `memory.edit`,
    and the task's text edit is a proposal with the reason that the conversation's text edit gets
    without a quote.
  - `grep -n "may name no memory tool that writes" docs/architecture/core/started-tasks.md` prints
    nothing.
- **Rollback:** no stored shape and no migration. The last release a deployment ran reads a task's
  versions and proposals: their origin is `task`.
- **Milestone:** 1.

### memory-gate-6. The gate's checks on labels

[The memory index issue](https://linear.app/zgeoff/issue/GEO-2364), the gate's part of its labels
step.

- **Outcome:** The gate checks the labels of a text write with its text, every label-only edit is a
  proposal with the reason `labels`, and `reviewReasons` holds `labels` with its sentence.
- **Follows:** every design section of the gate's checks on labels; `01-usage.ts`, sections B and C;
  `02-types.ts`, sections A, B, C and E; `03-flow.ts`, sections D, E and G.
- **Needs:** memory-index-2. "The labels and the revision", in
  [the memory index slices](memory-index.md), delivers `gist`, `topic` and `triggers` on
  `memory.remember` and `memory.edit`, the `memory.labelled` record and the approval of a label-only
  proposal. This slice ships in the pull request of memory-index-2. The text (open: labels web
  text), for the web review screen only.
- **Check:** `bun test modules/memory`, in tests that the slice adds:
  - a `memory.remember` whose gist holds a hidden character waits with `invisible_character`;
  - a `memory.remember` whose trigger holds a link that the quote lacks waits with `token_missing`;
  - a `memory.remember` whose labels and text pass, with a typed quote, applies;
  - a label-only edit from the conversation and one from a task are each a proposal with the reason
    `labels`;
  - a label-only edit with a hidden character waits with `invisible_character`;
  - a label-only edit with a destination-like token that the item's text lacks waits with `labels`
    and the token verdict `fail`;
  - a label-only edit with a token that the item's text holds waits with `labels` and the token
    verdict `pass`;
  - a label-only edit past the proposal cap of its turn is refused;
  - the approval of a label-only proposal writes one `memory.labelled` record with exactly the
    reviewed labels;
  - the checker's stub receives no label in any of these cases;
  - `renderReviewReason` gives the sentence of `02-types.ts`, section B, for `labels`, and
    `toReviewReason` reads an unknown reason as `other`.
- **Rollback:** no migration. The last release a deployment ran shows a stored `labels` proposal
  with the reason `other`, through `toReviewReason`.
- **Milestone:** 2.

### memory-gate-7. The gate reads the event that a granted task cites

[The log grant issue](https://linear.app/zgeoff/issue/GEO-2525), the gate's part.

- **Outcome:** A task with `log: conversation` that cites the event ID of a message you typed saves
  a memory with no proposal, when every check passes.
- **Follows:** "A quote that a task with the log grant cites" in the write gate; `01-usage.ts`,
  section D; `02-types.ts`, section E; `03-flow.ts`, section F.
- **Needs:** tasks-6. "The log grant", in [the wake and grant slices](tasks-wake-and-grant.md),
  delivers the `log` option and `ToolRun.logThread`. This slice lands with it or directly after it,
  and ahead of definitions-14, the note-taking example. The fault (open: gate quote thread). The
  check (open: cross-thread evidence), which runs first. The tests (open: log grant tests).
- **Check:** `bun test modules/memory/src/build-memory-tools.test.ts` and
  `bun test modules/memory/src/build-remember-tool.test.ts`. The cases rest on (open: log grant
  tests), so the list is not a gate until you confirm it:
  - a tool run whose `thread` is a task's and whose `logThread` is the conversation's calls
    `memory.remember` with a typed quote and the event ID of your message: the item is saved with
    the origin `task`, and no proposal is written;
  - the same, with a checker that answers not asserted: a proposal with `checker_not_asserted`;
  - the same, citing an event that is not your message: a proposal with `quote_not_typed`;
  - the same, citing an event on a third thread: a proposal with `no_quote`;
  - the same, with a quote and no `eventID`: a proposal with `no_quote`;
  - a tool run whose `logThread` is the task's own thread, citing the conversation's event: a
    proposal with `no_quote`;
  - the cited message backed a forgotten item: a proposal with `forgotten_evidence`;
  - the grant is taken from the setup after a `log.read` and ahead of the save: a proposal with
    `no_quote`. This case rests on (open: gate quote thread);
  - the conversation's own saves pass and wait as they did.

  Acceptance: a task with `log: conversation`, `log.read` and `memory.remember` saves a memory from
  a message you typed, with no proposal, when the checker confirms it.

- **Rollback:** no stored shape and no migration. The last release a deployment ran sends the same
  save to review with `no_quote`.
- **Milestone:** 3.

### memory-gate-8. The decision record of the eval

[The memory settings eval issue](https://linear.app/zgeoff/issue/GEO-2360).

- **Outcome:** A decision record, as a Linear document, settles each `eval` item of the open list,
  and the build issues are filed from it. Nothing of the eval is built in this slice.
- **Follows:** [the eval of memory settings](../memory-settings-eval.md).
- **Needs:** nothing from a slice. You, for both steps. A task runner for the eval, which is
  [the atc runner issue](https://linear.app/zgeoff/issue/GEO-1843) and is in no slice of this
  folder.
- **Check:** the record exists and settles the 5 items.
- **Milestone:** no deploy.
