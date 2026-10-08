# 0005: Effects, taint and prompts

- Date: 2026-10-07
- Status: decided, amended by [0008](./0008-auto-mode.md), [0014](./0014-search.md),
  [0015](./0015-taint-scope.md) and [0023](./0023-lifting-always-ask.md)
- Research: [policy model notes](../research/2.3-notes/policy-models.md),
  [approval notes](../research/2.3-notes/approvals.md),
  [2.2 and 2.3 landscape](../research/2.2-2.3-core-and-policy.md#policy-layers)

## Effects

Every nixie tool declares its effects, such as read, write, send, spend, or a change to rules,
approvals or budgets. Rules from [0004](./0004-rule-engine.md) match on those effects. 3 effects
always ask the owner unless a bounded rule from [0023](./0023-lifting-always-ask.md) lifts them:

- spending money
- widening approvals or rules: adding or loosening an allow rule, or removing a deny rule
- raising a budget

A change that only narrows, such as deleting a stale allow rule or lowering a budget, applies at
once. nixie records it, and the owner can undo it. Every other effect, deletion and sending to a new
recipient included, follows the owner's rules, within the destination limits below.

## Tool boundary

The main thread holds the owner's context and authority, and every capability reaches it as a nixie
tool, as [0002](./0002-approvals.md) requires. A tool is either deterministic code or a worker agent
in a container, and the main thread sees no difference. The record shows every worker run, with its
transcript and sources.

The conversation is always untrusted, and nixie keeps no taint flag on it, under
[0015](./0015-taint-scope.md). A tool's return type decides whether its result counts as clean:

- **Typed results,** such as a date, a number or a yes or no, are clean because nixie's policy
  endorses those low-information types, not because the values are clean. Injected instructions have
  little room in them. A search result is not one of them, because its titles and snippets are text
  from the pages, under [0014](./0014-search.md).
- **Free text** from outside, such as a summary of a page or an email body, is untrusted.

The destination limits apply to every send that starts from the conversation, and from every job run
in the first build. nixie asks the owner before it sends or acts towards a destination with no
standing permission. It stays free to reply to the owner, to the sender it read, and to people the
owner marks as known, and to write drafts and notes inside nixie. A worker holds only what its job
needs, never the owner's wider context, so injected instructions inside a worker have little to
leak.

## Prompts

The target is 0 approval prompts. Every prompt records which of 4 causes produced it:

1. **A direct request.** The owner asked for the action in a direct message, which can carry consent
   under [0006](./0006-approval-record.md).
2. **A repeat.** The owner approved the same action before and chose to allow it always.
3. **Outside steering.** nixie wants to send or act towards a destination with no standing
   permission and no consent in the owner's message.
4. **The always-ask set** above.

Only causes 3 and 4 may prompt. A prompt from cause 1 or 2 is a defect. With auto-mode on, an action
that no rule covers goes to auto-mode instead of the owner, and cause 3 first denies with a reason,
such as "write a draft instead", before it prompts; [0008](./0008-auto-mode.md) covers both. Phase 3
tests this with scripted scenarios, such as finding something on the web, triaging an inbox, and
booking a table, which report every prompt with its cause.

## Order of work

The cheap guarantees come first: the tool boundary, the always-ask set, and the destination limits
on sending tools, which the first build in 0015 ships. The later stages in 0015 come next. A typed
result cannot make the conversation clean, so typed workers serve jobs that must stay clean, not
prompts in the conversation. When a flow in the conversation prompts too often from cause 3, nixie
first loosens the risk stance for that context or adds a rule.

## Why

- The owner wants guarantees without a poor experience. The tool boundary costs little, because
  [0002](./0002-approvals.md) routes every capability through nixie's tools.
- Consent in the owner's own message lets a direct request run with no prompt.
- Recording the cause of every prompt turns "no friction" into a requirement that a scenario can
  fail.

## Alternatives

- **No taint layer.** Rules and approvals alone decide each action. An injected instruction is
  stopped only when a rule happens to ask, which breaks the principle that untrusted content cannot
  reach a new destination alone.
- **Taint per task.** One task reads and acts, and taint limits it once it reads untrusted content.
  It puts the boundary inside a task instead of at the tools, and needs extra rules, such as which
  URLs a tainted task may fetch. [0015](./0015-taint-scope.md) adopts taint per job run, with an
  outbound URL check, as a later stage for jobs only, where clean runs are possible.
- **A model as the defence.** Shipping products such as Dots rely on the model's trained resistance
  and on reviewer models. Claude Code's full auto mode pipeline has a 17% false-negative rate on
  real overeager actions
  ([Anthropic engineering](https://www.anthropic.com/engineering/claude-code-auto-mode),
  2026-03-25). nixie keeps a model only as an extra layer that can tighten a decision.

## Consequences

- Search is one of nixie's own tools against a search API the owner picks, because model-side web
  search exists only with some providers. The provider receives the owner's queries.
- Typed workers need a typed output per capability, and 0015 makes them a later stage.
- How quickly an imp worker starts decides whether each worker run gets its own container.
- A known contact's compromised account can steer nixie into sends to that contact with no prompt,
  because the owner chose to trust that contact.
