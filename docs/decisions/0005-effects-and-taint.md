# 0005: Effects, taint and prompts

- Date: 2026-10-07
- Status: decided
- Design: [decision point](../design/policy/decision-point.md)
- Research: [policy rules spike](../../spikes/policy-rules/),
  [approval notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.3-notes/approvals.md)

## Effects

Every nixie tool declares its effects, such as read, write, send, spend, or a change to rules,
approvals or budgets. Rules from [0004](./0004-rule-engine.md) match on those effects. 3 effects
form the always-ask set, and always ask unless a bounded rule from
[0023](./0023-lifting-always-ask.md) lifts them:

- spending money
- widening approvals or rules: adding or loosening an allow rule, or removing a deny rule
- raising a budget

A change that only narrows, such as deleting a stale allow rule or lowering a budget, applies at
once, with a record and undo. Every other effect, deletion and sending to a new recipient included,
follows your rules, within the destination limits below.

## Tool boundary

Every capability reaches the conversation as a nixie tool, as [0002](./0002-approvals.md) requires.
A tool is either deterministic code or a worker in its own imp, and the conversation sees no
difference. The record shows every worker run, with its transcript and sources.

The conversation is always untrusted, under [0015](./0015-taint-scope.md). A tool's return type
decides whether its result counts as clean:

- **Typed results,** such as a date, a number or a yes or no, are clean because nixie's policy
  endorses those low-information types, not because the values are clean. A search result is not one
  of them, because its titles and snippets are text from the pages, under [0014](./0014-search.md).
- **Free text** from outside, such as a summary of a page or an email body, is untrusted.

The destination limits apply to every send that starts from the conversation, and from every job
run. nixie asks before it sends or acts towards a destination with no standing permission. It stays
free to reply to you, to the sender it read, and to people you mark as known, and to write drafts
and notes inside nixie. A worker holds only what its job needs, so injected instructions inside a
worker have little to leak.

## Prompts

The target is 0 approval prompts. Every prompt records which of 6 causes produced it:

1. **A direct request.** You asked for the action in a direct message, which carries consent under
   [0006](./0006-approval-record.md).
2. **A repeat.** You approved the same action before and chose "always allow".
3. **Outside steering.** nixie wants to send or act towards a destination with no standing
   permission and no consent in your message.
4. **The always-ask set** above.
5. **No rule matched.** No rule covers the action, so it asks under 0004, with auto-mode off.
6. **Your own ask rule.** A rule you wrote asks for the action, such as "ask before deleting for
   good".

Causes 3, 4, 5 and 6 may prompt, and a prompt from cause 1 or 2 is a defect. A prompt from cause 6
counts apart from the 0-prompt target. A prompt from cause 5 counts as a gap in your rules: the
record groups these prompts by tool and context, and nixie can propose the rule that would remove a
run of them, such as "you approved this 5 times; allow it?". Creating that rule is a widening, so it
asks once. With auto-mode on, an action that no rule covers goes to auto-mode instead of you, and
cause 3 first denies with a reason, such as "write a draft instead", before it prompts, under
[0008](./0008-auto-mode.md). Scripted scenarios, such as finding something on the web, triaging an
inbox and booking a table, report every prompt with its cause.

## Why

- The tool boundary gives guarantees at little cost, because 0002 already routes every capability
  through nixie's tools.
- Consent in your own message lets a direct request run with no prompt.
- Recording the cause of every prompt turns "no friction" into a requirement that a scenario can
  fail.
- A prompt from your own ask rule is neither a gap nor a defect. Counting it as a gap would have
  nixie propose rules that undo yours.

## Alternatives

- **No taint layer.** Rules and approvals alone decide each action. An injected instruction is
  stopped only when a rule happens to ask, which breaks the principle that untrusted content cannot
  reach a new destination alone.
- **Taint per task.** It puts the boundary inside a task instead of at the tools, and needs extra
  rules, such as which URLs a tainted task may fetch. [0015](./0015-taint-scope.md) adopts taint per
  job run as a later stage, for jobs only, where clean runs are possible.
- **A model as the defence.** A classifier misses real overeager actions, under
  [0008](./0008-auto-mode.md), so nixie keeps a model only as a layer that can tighten a decision.
- **Prompts from your ask rules counted as "no rule matched".** It keeps 5 causes, and mixes your
  own prompts with the gaps nixie tries to close.

## Consequences

- Search is one of nixie's own tools against a search API you pick, because model-side web search
  exists only with some providers.
- Typed workers need a typed output per capability, and 0015 makes them a later stage.
- A known contact's compromised account can steer nixie into sends to that contact with no prompt,
  because you chose to trust that contact.
