# 0015: Where taint applies

- Date: 2026-10-08
- Status: decided
- Amends: [0005](./0005-effects-and-taint.md)
- Research: [taint in practice](../research/2.3-notes/taint-in-practice.md),
  [policy model notes](../research/2.3-notes/policy-models.md#information-flow-and-taint)

The conversation with the owner is always untrusted, and nixie keeps no taint flag on it. Taint
applies to jobs and workers, the parts of nixie that can stay clean, and the first build treats them
as untrusted too. The design keeps the hooks that let later stages track taint per run without a
migration.

## The conversation

A conversation reads outside content within minutes, and no system examined clears taint once that
content is in a model's context. A flag on the conversation would be on nearly all the time and
would tell nixie nothing. The destination limits from 0005 therefore apply to every send that starts
from the conversation, and auto-mode from [0008](./0008-auto-mode.md) decides the grey cases.
Consent in the owner's own message, under [0006](./0006-approval-record.md), still lets a direct
request run with no prompt.

## Jobs

A job is a schedule, instructions and a list of tools, kept as separate fields. A job's worker can
call only the tools on that list, so the list is the job's scope: the worker sees only what those
tools return. The effects that each tool declares under 0005 give the job its risk. Creating a job
is itself a tool call, so the owner's rules decide which jobs nixie schedules on its own and which
need the owner's sign-off, and a job with an always-ask effect always asks.

## Stages

The first build ships:

- the conversation as always untrusted
- the destination limits and the always-ask set, enforced deterministically
- jobs as a schedule, instructions and a tool list, with sign-off decided by the owner's rules
- every job run treated as untrusted

Later stages follow when real use shows the need:

- taint per job run, so a job that reads only the owner's data runs without the destination limits
- auto-mode checks on free-text replies
- an outbound check that blocks a web fetch whose URL carries private context
- typed workers or disposable branches for jobs that must stay clean

The first build includes 3 hooks for those stages:

- The event log records the source of every tool result: the owner's words, the owner's own data, or
  outside content. The first build stores it without acting on it.
- Job definitions are structured from the start, with the schedule, instructions, tool list and
  allowed destinations as separate fields.
- Every tool declares its effects, as 0005 requires.

## Typed results

In every research system examined, a typed value derived from untrusted data keeps its untrusted
label. A system may choose to accept low-information types, which FIDES calls endorsement. The clean
return types in 0005, such as dates, numbers and yes or no answers, are clean because nixie's policy
endorses those types, not because the values are clean.

## Why

- A taint flag that is almost always on adds code and no decisions.
- A clean planner never reads outside content, and a planner that cannot read the page is not a
  useful assistant. Shipping agents made the same choice and put their checks around the model.
- Jobs are where clean runs are possible and where taint pays off, by sparing a job that reads only
  the owner's data from destination prompts.
- Scoping a job by its tool list needs no new mechanism, because the rule engine already checks
  every tool call.
- Each stage builds on the hooks above, so a later stage is a policy change, not a migration.

## Alternatives

- **Keep the taint flag on the conversation.** It is nearly always on, and nothing clears it.
- **Clear taint at the owner's next message,** as OpenClaw does for memory. The outside content is
  still in the model's context after the owner speaks, so the reset is not sound.
- **Keep the planner clean,** as CaMeL does. CaMeL completed fewer tasks than an undefended agent,
  used more tokens, and supports no multi-turn conversation.
- **Clean a job through the owner's approval.** No shipping product cleans an artifact this way, and
  people approve almost every prompt they see.

## Consequences

- A job that sends free text to an allowed destination, such as a reply to a sender, can leak
  whatever its tools reach. The tool list limits that, and the owner sees the list at sign-off.
- Cause 1 in 0005's prompt causes, a direct request, now means that the owner asked for the action
  in a direct message, since the conversation is never clean.
- [0011](./0011-memory-writes.md) applies a memory write at once only when an exact quote from the
  owner's own message backs it and a checker model confirms the quote supports it.
- [0014](./0014-search.md) no longer needs a search to mark the conversation, because the
  conversation is always untrusted.
