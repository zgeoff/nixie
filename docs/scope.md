# Scope

nixie's scope is a set of requirements in 3 tiers and a list of non-goals. Each requirement traces
to a kind of job nixie runs, a [principle](./principles.md), the case for nixie, or a gap that a
survey of existing assistants and frameworks found. Where a decision record settles how nixie meets
a requirement, the requirement links it.

## Requirements

A requirement sits in one of 3 tiers, which set the order of delivery:

| Tier | Meaning                                                                              |
| ---- | ------------------------------------------------------------------------------------ |
| 1    | nixie is unusable without it. You start using nixie once tier 1 lands.               |
| 2    | nixie is effective across tasks with it. Each item is a focused unlock of behaviour. |
| 3    | A pure extension.                                                                    |

A ★ marks a requirement that the architecture designs for from the start, whatever its tier, because
adding it later means a redesign.

### Tier 1

| Requirement                                                                                                                                                                                                      | Source                                                         | Decisions                                                                                          | ★   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --- |
| Two-way conversation in text in the web client, with pushes from nixie through a chat notifier                                                                                                                   | Why nixie                                                      | [0009](./decisions/0009-first-channel.md)                                                          | ★   |
| Your identity on each channel, with messages from anyone else refused                                                                                                                                            | Survey                                                         | [0016](./decisions/0016-own-interfaces.md)                                                         | ★   |
| A task overview dashboard with each task's status, last update and what it waits on, with pause and stop for tasks and schedules; opening a task shows it as a conversation in the same view as the conversation | Nothing is hidden                                              | [0018](./decisions/0018-the-conversation-and-tasks.md)                                             | ★   |
| One agent runtime adapter: the Claude Agent SDK                                                                                                                                                                  | Any model, through adapters                                    | [0003](./decisions/0003-sdk-placement.md)                                                          | ★   |
| Schedule triggers, and background tasks that report when done                                                                                                                                                    | Briefings, background work                                     | [0016](./decisions/0016-own-interfaces.md), [0018](./decisions/0018-the-conversation-and-tasks.md) |     |
| A policy engine outside the runtime, with your override and approvals stored as records                                                                                                                          | The owner has root; policy is deterministic                    | [0004](./decisions/0004-rule-engine.md), [0006](./decisions/0006-approval-record.md)               | ★   |
| A record of every decision and action                                                                                                                                                                            | Nothing is hidden                                              | [0001](./decisions/0001-durable-layer.md)                                                          | ★   |
| Brokered credentials, no new destination for a task that reads untrusted content, and safe network defaults                                                                                                      | Untrusted content cannot reach a new destination alone; survey | [0005](./decisions/0005-effects-and-taint.md), [0007](./decisions/0007-grants-and-taint.md)        | ★   |
| Long-term memory you can read, edit and export                                                                                                                                                                   | Nothing is hidden; capture and recall                          | [0010](./decisions/0010-memory-store.md)                                                           | ★   |
| The connector interface, with one connector                                                                                                                                                                      | Upkeep of a service you use                                    | [0016](./decisions/0016-own-interfaces.md), [0019](./decisions/0019-connector-authorization.md)    |     |
| Persona, jobs, and policy supplied by the deployment                                                                                                                                                             | Behaviour is data                                              | [0020](./decisions/0020-deployment.md)                                                             |     |
| A hard spending stop                                                                                                                                                                                             | Survey                                                         | [0028](./decisions/0028-policy-design.md)                                                          |     |

### Tier 2

| Requirement                                                                                                                      | Source                       | Decisions                                                                                    | ★   |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- | --- |
| Voice in both directions, with interruption                                                                                      | Why nixie                    | [0009](./decisions/0009-first-channel.md)                                                    | ★   |
| One conversation that continues across channels                                                                                  | Why nixie                    | [0009](./decisions/0009-first-channel.md)                                                    | ★   |
| The Android app, built with Expo React Native                                                                                    | Why nixie                    | [0009](./decisions/0009-first-channel.md)                                                    | ★   |
| Execution that resumes at its last step after a restart, with every action safe to repeat                                        | Background work; survey      | [0001](./decisions/0001-durable-layer.md), [0002](./decisions/0002-approvals.md)             | ★   |
| Review of memory writes, and memory upkeep that merges, settles contradictions, and prunes                                       | Survey                       | [0011](./decisions/0011-memory-writes.md)                                                    | ★   |
| Versioned definitions of persona, jobs, and policy, with the version stored in every record                                      | Survey                       | [0013](./decisions/0013-definition-versioning.md)                                            | ★   |
| Event triggers, a cheap periodic check, and read-only defaults for work that nixie starts itself                                 | Reminders; survey            | [0015](./decisions/0015-taint-scope.md), [0016](./decisions/0016-own-interfaces.md)          |     |
| The full live view: finished tasks, what each task did and why, the memory tap-through, and a report of skipped or late triggers | Nothing is hidden; survey    | [0018](./decisions/0018-the-conversation-and-tasks.md)                                       |     |
| Steering coding sessions through the atc adapter, run as a task, with the MCP proxy it needs                                     | Jobs                         | [0017](./decisions/0017-mcp-proxy.md), [0022](./decisions/0022-coding-and-code-execution.md) |     |
| Approval choices: once, always, rules set in advance, a default for an unanswered request, and take-over of a sensitive step     | The owner has root; survey   | [0006](./decisions/0006-approval-record.md)                                                  |     |
| Undo for reversible actions through checkpoints, and least privilege for each tool                                               | Survey                       | [0015](./decisions/0015-taint-scope.md)                                                      |     |
| Budgets per job, a model tier per job, and a limit on concurrent work                                                            | Survey                       | [0028](./decisions/0028-policy-design.md)                                                    |     |
| Health checks reported through another channel, safe upgrades with rollback, and backups of personal data                        | Your data stays home; survey | [0020](./decisions/0020-deployment.md)                                                       |     |
| Trust rules for skills: signed, pinned, scanned, with review of skills that nixie writes itself                                  | Survey                       |                                                                                              |     |

nixie integrates a realtime voice model through an adapter and does not build one. nixie owns the
voice session itself: it reconnects when a provider session ends, keeps a transcript of what you
heard, and brings in results without interrupting.

### Tier 3

| Requirement                                                                                                                                     | Source                                            | Decisions                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| More connectors, more runtime adapters, and local models for private data                                                                       | Any model, through adapters; work on private data |                                                                                                |
| Acting in the outside world behind a catastrophic-outcome gate: payments through single-use card numbers, phone calls, and a persistent browser | Acting in the outside world; survey               | [0005](./decisions/0005-effects-and-taint.md), [0012](./decisions/0012-high-risk-approvals.md) |
| A safety monitor that stops a running task, a tamper-evident record, scanning for leaked secrets, and a security self-check                     | Survey                                            |                                                                                                |
| Tests that run before a behaviour change goes live, and a grader that checks a task's output                                                    | Survey                                            |                                                                                                |
| An identity for nixie with its own name, avatar, and email address                                                                              | Survey                                            |                                                                                                |

## Non-goals

Each non-goal records something nixie deliberately is not.

- **Multi-user.** One deployment serves one person, with no shared or tenant accounts.
- **A hosted service.** nixie is software you run, never a service run for other people. You
  register your own OAuth clients, and nixie ships no central OAuth app, under
  [0019](./decisions/0019-connector-authorization.md).
- **Model building.** nixie integrates language and voice models. It runs local models but never
  trains its own.
- **Zero risk.** nixie trades risk against usefulness per context, as you set it. It does not try to
  rule out every bad outcome.
- **A coding agent.** nixie is not a coding agent; it steers coding agents through adapters, under
  [0022](./decisions/0022-coding-and-code-execution.md).
