# 0005: Effects, taint and prompts

- Date: 2026-10-07
- Status: decided
- Research: [policy model notes](../research/2.3-notes/policy-models.md),
  [approval notes](../research/2.3-notes/approvals.md),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#policy-layers)

## Effects

Every nixie tool declares its effects, such as read, write, send, spend, or a change to rules,
approvals or budgets. Rules from [0004](./0004-rule-engine.md) match on those effects. 3 effects
always ask the owner, and no rule lifts them:

- spending money
- widening approvals or rules: adding or loosening an allow rule, or removing a deny rule
- raising a budget

A change that only narrows, such as deleting a stale allow rule or lowering a budget, applies at
once. nixie records it, and the owner can undo it. Every other effect, deletion and sending to a new
recipient included, follows the owner's rules.

## Tool boundary

The main thread holds the owner's context and authority, and every capability reaches it as a nixie
tool, as [0002](./0002-approvals.md) requires. A tool is either deterministic code or a worker agent
in a container, and the main thread sees no difference. The record shows every worker run, with its
transcript and sources.

A tool's return type decides its effect on the main thread:

- **Typed results,** such as a search API's JSON, a list of URLs, a date, or a yes or no, leave the
  main thread clean. Injected instructions cannot ride along in them.
- **Free text** from outside, such as a summary of a page or an email body, marks the main thread as
  tainted for the rest of its task.

A tainted main thread asks the owner before it sends or acts towards a destination with no standing
permission. It stays free to reply to the owner, to the sender it read, and to people the owner
marks as known, and to write drafts and notes inside nixie. A worker holds only what its job needs,
never the owner's wider context, so injected instructions inside a worker have little to leak.

## Prompts

The target is 0 approval prompts. Every prompt records which of 4 causes produced it:

1. **A direct request.** The owner asked for the action, and the main thread is clean.
2. **A repeat.** The owner approved the same action before and chose to allow it always.
3. **Outside steering.** A tainted main thread wants to send or act towards a new destination.
4. **The always-ask set** above.

Only causes 3 and 4 may prompt. A prompt from cause 1 or 2 is a defect. Phase 3 tests this with
scripted scenarios, such as finding something on the web, triaging an inbox, and booking a table,
which report every prompt with its cause.

## Order of work

The cheap guarantees come first: the tool boundary, the taint flag, and the destination limits on
sending tools. Typed workers come next, for the flows where real use shows prompts from cause 3.
When a flow still prompts too often, nixie first loosens the risk stance for that context, and adds
a typed worker only for a flow worth its cost.

## Why

- The owner wants guarantees without a poor experience. The tool boundary costs little, because
  [0002](./0002-approvals.md) routes every capability through nixie's tools.
- A clean main thread lets the owner's direct requests run with no prompt, so typed workers that
  keep it clean are where the effort pays off most.
- Recording the cause of every prompt turns "no friction" into a requirement that a scenario can
  fail.

## Alternatives

- **No taint layer.** Rules and approvals alone decide each action. An injected instruction is
  stopped only when a rule happens to ask, which breaks the principle that untrusted content cannot
  reach out alone.
- **Taint per task.** One task reads and acts, and taint limits it once it reads untrusted content.
  It puts the boundary inside a task instead of at the tools, and needs extra rules, such as which
  URLs a tainted task may fetch.
- **A model as the defence.** Shipping products such as Dots rely on the model's trained resistance
  and on reviewer models. nixie keeps a model only as an extra layer that can tighten a decision.

## Consequences

- Search is one of nixie's own tools against a search API the owner picks, because model-side web
  search exists only with some providers. The provider receives the owner's queries.
- Typed workers need a typed output per capability, and Phase 3 designs the first ones.
- How quickly an imp worker starts decides whether each job gets its own container.
- A known contact's compromised account can steer a clean main thread, because the owner chose to
  trust that contact.
