# 0015: Where taint applies

- Date: 2026-10-08
- Status: decided
- Research:
  [taint in practice](https://github.com/zgeoff/nixie/blob/research-archive/docs/research/2.3-notes/taint-in-practice.md)

The conversation is always untrusted, and nixie keeps no taint flag on it. Taint applies to jobs and
workers, the parts of nixie that can stay clean, and the first build treats them as untrusted too.
The first build keeps the hooks that let later stages track taint per job run without a migration.

## The conversation

A conversation reads outside content within minutes, and no system examined clears taint once that
content is in a model's context. A flag on the conversation would be on nearly all the time and
would tell nixie nothing. The destination limits from [0005](./0005-effects-and-taint.md) therefore
apply to every send that starts from the conversation. With auto-mode from
[0008](./0008-auto-mode.md) on, such a send first gets a deny with a reason, and auto-mode never
allows a destination the limits hold back. Consent in your own message, under
[0006](./0006-approval-record.md), still lets a direct request run with no prompt.

## Jobs

A job is a schedule or trigger, instructions and a tool list, kept as separate fields. A job's
workers can call only the tools on that list, so the list is the job's scope. The effects that each
tool declares give the job its risk. Creating a job is itself a tool call: a job you ask for passes
by consent, a job nobody asked for asks, and a job whose tools spend or delete for good asks through
the always-ask set and your ask rules, under [0028](./0028-policy-design.md).

## Stages

The first build ships:

- the conversation as always untrusted
- the destination limits and the always-ask set, enforced deterministically
- jobs as a schedule or trigger, instructions and a tool list
- every job run treated as untrusted

Later stages follow when real use shows the need:

- taint per job run, so a job that reads only your data runs without the destination limits
- auto-mode checks on free-text replies
- an outbound check that blocks a web fetch whose URL carries private context
- typed workers or disposable branches for jobs that must stay clean

The first build includes 3 hooks for those stages:

- The event log records the source of every tool result: your words, your own data, or outside
  content.
- Job definitions keep the schedule, instructions, tool list and allowed destinations as separate
  fields.
- Every tool declares its effects, as 0005 requires.

## Typed results

In every research system examined, a typed value derived from untrusted data keeps its untrusted
label ([FIDES](https://arxiv.org/html/2505.23643v2)). A system may choose to accept low-information
types, which FIDES calls endorsement. The clean return types in 0005, such as dates, numbers and yes
or no answers, are clean because nixie's policy endorses those types, not because the values are
clean.

## Why

- A taint flag that is almost always on adds code and no decisions.
- A clean planner never reads outside content, and a planner that cannot read the page is not a
  useful assistant.
- Jobs are where clean runs are possible and where taint pays off, by sparing a job that reads only
  your data from destination prompts.
- Scoping a job by its tool list needs no new mechanism, because the rule engine already checks
  every tool call.
- Each stage builds on the hooks above, so a later stage is a policy change, not a migration.

## Alternatives

- **Keep the taint flag on the conversation.** It is nearly always on, and nothing clears it.
- **Clear taint at your next message.** The outside content is still in the model's context after
  you speak, so the reset is not sound.
- **Keep the planner clean,** as CaMeL does. CaMeL solves 77% of AgentDojo tasks against 84%
  undefended, at about 2.8 times the tokens on the median task, and its evaluation covers no
  multi-turn conversation ([CaMeL](https://arxiv.org/abs/2503.18813)).
- **Clean a job through your approval.** Claude Code users approve 93% of permission prompts
  ([Anthropic engineering](https://www.anthropic.com/engineering/claude-code-auto-mode)), so an
  approval says little about the content.

## Consequences

- A job that sends free text to an allowed destination, such as a reply to a sender, can leak
  whatever its tools reach. The tool list limits that, and the job notice shows the list.
- A memory write applies at once only under the checks in [0011](./0011-memory-writes.md).
- A search under [0014](./0014-search.md) marks nothing, because the conversation is always
  untrusted.
