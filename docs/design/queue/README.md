# The queue design

This folder holds the design for the work that nixie has not built yet. Each doc states the rules of
one thing to build. The sketches hold its shapes and its exact texts as code. A builder starts at
the work list, and reads only what its slice names.

## How to read it

1. [The work list](work-list.md) gives every slice in build order, by milestone. A slice is one pull
   request, or a few that ship together. The slices are in [`slices/`](slices/), and
   [the gaps](work-gaps.md) lists the work that no slice holds.
2. A slice names the docs and the sketch sections it follows, the slices it needs, and the check
   that proves it.
3. A doc states the rules. It has a section "Built" for what the code does, and then the design.
4. A sketch in [`sketches/`](sketches/) holds the types, the tool inputs and outputs, the records,
   the config keys, the flow and each error text. No package builds a sketch.
5. [The open list](open.md) holds everything that is not settled. A doc marks each such place as
   `(open: <name>)`. Read the open items of a slice before you build it.

Where a decision has a record, the doc links it. The records are in
[`docs/decisions/`](../../decisions/).

## The docs

| Area                      | Docs                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory index              | [labels](memory-labels.md), [revision](memory-revision.md), [the index](memory-index.md), [recall](memory-recall.md), [what a turn brings](memory-turn-push.md)                                                                                                                                                                                                                                            |
| Memory writes             | [the write gate](memory-write-gate.md), [labels at the gate](memory-write-gate-labels.md), [memory tools on a task](memory-task-tools.md), [no built-in memory task](memory-task-delete.md), [the settings eval](memory-settings-eval.md)                                                                                                                                                                  |
| Tasks                     | [task runs](task-runs-and-reports.md), [report delivery](task-report-delivery.md), [limits](task-run-limits.md), [the report shape](task-report-shape.md), [messages](task-messages.md), [the brief](task-brief.md), [waking a task](task-wake.md), [the log grant](task-log-grant.md), [workers](task-workers.md), [the runner port](task-runner-port.md), [end-to-end checks](task-end-to-end-checks.md) |
| Definitions               | [definitions](task-definitions.md), [a definition's task](definition-tasks.md), [its task runs](definition-task-runs.md), [schedules](schedules-and-triggers.md), [the trigger core](trigger-core.md), [definitions from chat](definitions-from-chat.md), [undo and export](definition-undo-and-export.md), [the views](definition-views.md), [the examples](example-definitions.md)                       |
| Sandboxes                 | [sizes](sandbox-sizes.md), [the memory-kill signal](memory-kill-signal.md), [images](sandbox-images.md), [the image set](sandbox-image-set.md), [Kubernetes step order](kubernetes-step-order.md)                                                                                                                                                                                                          |
| Web                       | [page fetch](page-fetch.md), [pause and cache](page-fetch-pause-and-cache.md), [secret URLs](secret-url-refusal.md), [secret URLs at each hop](secret-url-hops.md), [search cost records](search-cost-records.md), [short IDs](short-ids.md)                                                                                                                                                               |
| Operations                | [backup and recovery](backup-and-recovery.md), [publish and fetch](backup-publish-and-fetch.md), [the release of a hold](recovery-release.md), [the rollback check](rollback-check.md), [seed rules](seed-rules.md), [evidence lanes](evidence-lanes.md)                                                                                                                                                   |
| Model harnesses           | [the harness boundary](model-harnesses.md), [sessions](harness-sessions.md), [the Codex harness](codex-harness.md), [OpenRouter tasks](openrouter-tasks.md), [the turn-input log](turn-input-log.md), [its store](turn-input-store.md)                                                                                                                                                                     |
| Moments and forgets       | [a forget and a task's session](forget-and-task-sessions.md), [photos](moments.md), [across threads](moment-across-threads.md), [replay checks](moment-replay-checks.md), [redaction](redaction.md), [rule reasons](rule-reasons.md)                                                                                                                                                                       |
| Ports and design sessions | [port rules](port-rules.md), [the design sessions](design-sessions-to-run.md)                                                                                                                                                                                                                                                                                                                              |
