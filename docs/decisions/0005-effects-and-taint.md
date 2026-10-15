# 0005: Effects, taint and prompts

- Date: 2026-10-07
- Updated: 2026-10-15
- Status: decided
- Design: [decision point](../design/platform/policy/decision-point.md),
  [rules](../design/platform/policy/rules.md)
- Research: [policy rules spike](../design/platform/spikes/policy-rules/),
  [approval notes](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.3-notes/approvals.md),
  [taint in practice](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.3-notes/taint-in-practice.md)

## Effects

Every nixie tool declares its effects, such as read, write, send, spend, or a change to rules,
approvals or budgets. Rules from [0004](0004-rule-engine.md) match on those effects. 3 effects form
the always-ask set, and always ask unless a bounded rule lifts them:

- spending money
- widening approvals or rules: adding or loosening an allow rule, or removing a deny rule
- raising a budget

A change that only narrows, such as deleting a stale allow rule or lowering a budget, applies at
once, with a record and undo. Every other effect, deletion and sending to a new recipient included,
follows your rules, within the destination limits below.

## Lifting the always-ask set

The always-ask set is the default, and a bounded rule can lift it, such as "spend up to $20 per
purchase and $100 per month at these merchants". 3 guards apply:

- **A lifting rule is bounded.** Its bounds are a budget, and raising a budget is always-ask, so a
  lifting rule cannot grow quietly. An unbounded rule, such as "spend freely", is not allowed.
- **Creating or widening a lifting rule is always-ask.** Its confirmation shows the rule as a
  sentence and marks it as lifting the always-ask set, and it takes the passkey check from
  [0012](0012-high-risk-approvals.md).
- **The record names who proposed it:** you, or nixie from a conversation.

Approvals look different by risk. nixie knows each action's declared effects, so the client renders
an approval in the always-ask set, and above all one that lifts it, as visually distinct from a
routine approval.

## Tool boundary

Every capability reaches the conversation as a nixie tool, as [0002](0002-approvals.md) requires. A
tool is either deterministic code or a worker in its own imp, and the conversation sees no
difference. The record shows every worker run, with its transcript and sources.

A tool's return type decides whether its result counts as clean:

- **Typed results,** such as a date, a number or a yes or no, are clean because nixie's policy
  endorses those low-information types, not because the values are clean. A typed value derived from
  untrusted data keeps its untrusted label in every system examined
  ([FIDES](https://arxiv.org/html/2505.23643v2)), so this is a policy choice. A search result is not
  a typed result, because its titles and snippets are text from the pages, under
  [0014](0014-search.md).
- **Free text** from outside, such as a summary of a page or an email body, is untrusted.

The destination limits apply to every send that starts from the conversation, and from every job
run. nixie asks before it sends or acts towards a destination with no standing permission. It stays
free to reply to you, to the sender it read, and to people you mark as known, and to write drafts
and notes inside nixie. A worker holds only what its job needs, so injected instructions inside a
worker have little to leak.

## Where taint applies

The conversation is always untrusted, and nixie keeps no taint flag on it. Taint applies to jobs and
workers, the parts of nixie that can stay clean, and the first build treats them as untrusted too.

A conversation reads outside content within minutes, and no system examined clears taint once that
content is in a model's context. A flag on the conversation would be on nearly all the time and
would tell nixie nothing. The destination limits therefore apply to every send that starts from the
conversation. With auto-mode from [0008](0008-auto-mode.md) on, such a send first gets a deny with a
reason, and auto-mode never allows a destination the limits hold back. Consent in your own message,
under [0006](0006-approval-record.md), still lets a direct request run with no prompt.

A job is a schedule or trigger, instructions and a tool list, kept as separate fields. A job's
workers can call only the tools on that list, so the list is the job's scope. The effects that each
tool declares give the job its risk. Creating a job is itself a tool call, which the starter rules
from [0028](0028-policy-design.md) decide.

The first build ships the conversation as always untrusted, the destination limits and the
always-ask set enforced deterministically, jobs as a schedule or trigger, instructions and a tool
list, and every job run treated as untrusted. Later stages follow when real use shows the need:

- taint per job run, so a job that reads only your data runs without the destination limits
- auto-mode checks on free-text replies
- an outbound check that blocks a web fetch whose URL carries private context
- typed workers or disposable branches for jobs that must stay clean

The first build includes 3 hooks for those stages:

- The event log records the source of every tool result: your words, your own data, or outside
  content.
- Job definitions keep the schedule, instructions, tool list and allowed destinations as separate
  fields.
- Every tool declares its effects.

## Prompts

The target is 0 approval prompts. Every prompt records which of 6 causes produced it:

1. **A direct request.** You asked for the action in a direct message, which carries consent under
   [0006](0006-approval-record.md).
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
[0008](0008-auto-mode.md). Scripted scenarios, such as finding something on the web, triaging an
inbox and booking a table, report every prompt with its cause.

## Why

- The tool boundary gives guarantees at little cost, because 0002 already routes every capability
  through nixie's tools.
- A taint flag that is almost always on adds code and no decisions.
- A clean planner never reads outside content, and a planner that cannot read the page is not a
  useful assistant.
- Jobs are where clean runs are possible and where taint pays off, by sparing a job that reads only
  your data from destination prompts. Scoping a job by its tool list needs no new mechanism, because
  the rule engine already checks every tool call.
- Each taint stage builds on the hooks above, so a later stage is a policy change, not a migration.
- The principle "The owner has root" lets you change every rule, and a set that no rule can lift
  would break it. Approving something unwise is your right, and the design makes such an approval
  clear, not impossible.
- No channel is out of a steered model's reach: nixie may edit its own definitions through a coding
  session. Your confirmation in the client is the real guarantee whichever channel proposes a
  lifting rule, so a separate channel would add friction without adding protection.
- A record of who proposed each lift lets nixie and you find surprising or stale lifts, as nixie
  reviews its own rules with you under 0006.
- Consent in your own message lets a direct request run with no prompt.
- Recording the cause of every prompt turns "no friction" into a requirement that a scenario can
  fail.
- A prompt from your own ask rule is neither a gap nor a defect. Counting it as a gap would have
  nixie propose rules that undo yours.

## Alternatives

- **No taint layer.** Rules and approvals alone decide each action. An injected instruction is
  stopped only when a rule happens to ask, which breaks the principle that untrusted content cannot
  reach a new destination alone.
- **A taint flag on the conversation,** set when it reads free text and kept for the rest of its
  task. It is nearly always on, and nothing clears it.
- **Clear taint at your next message.** The outside content is still in the model's context after
  you speak, so the reset is not sound.
- **Taint per task.** It puts the boundary inside a task instead of at the tools, and needs extra
  rules, such as which URLs a tainted task may fetch.
- **Keep the planner clean,** as CaMeL does. CaMeL solves 77% of AgentDojo tasks against 84%
  undefended, at about 2.8 times the tokens on the median task, and its evaluation covers no
  multi-turn conversation ([CaMeL](https://arxiv.org/abs/2503.18813)).
- **Clean a job through your approval.** Claude Code users approve 93% of permission prompts
  ([Anthropic engineering](https://www.anthropic.com/engineering/claude-code-auto-mode)), so an
  approval says little about the content.
- **A model as the defence.** A classifier misses real overeager actions, under 0008, so nixie keeps
  a model only as a layer that can tighten a decision.
- **No rule lifts the always-ask set.** It breaks the principle "The owner has root", and rules out
  a spending allowance for good.
- **Only the definitions repo can change the always-ask set, with a confirmation in the client.** It
  adds friction, and the repo is reachable through a coding session anyway.
- **Prompts from your ask rules counted as "no rule matched".** It keeps 5 causes, and mixes your
  own prompts with the gaps nixie tries to close.

## Consequences

- Search is one of nixie's own tools against a search API you pick, because model-side web search
  exists only with some providers. A search marks nothing, because the conversation is always
  untrusted.
- Typed workers need a typed output per capability, and they are a later stage.
- A job that sends free text to an allowed destination, such as a reply to a sender, can leak
  whatever its tools reach. The tool list limits that, and the job notice shows the list.
- A memory write applies at once only under the checks in [0011](0011-memory-writes.md).
- A known contact's compromised account can steer nixie into sends to that contact with no prompt,
  because you chose to trust that contact.

## Changes

- 2026-10-08: a bounded rule can lift the always-ask set, where the first version let no rule lift
  it.
- 2026-10-08: the conversation is always untrusted and carries no taint flag, and taint applies to
  jobs and workers in stages. The first version marked the conversation as tainted once it read free
  text, and counted a search API's results as typed.
- 2026-10-10: a prompt from your own ask rule counts as its own cause, under
  [0028](0028-policy-design.md).
- 2026-10-15: record 0015, Where taint applies, and record 0023, Lifting the always-ask set, merged
  into this record.
