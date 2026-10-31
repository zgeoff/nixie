# 0048: One approval system

- Date: 2026-10-31
- Status: decided
- Design: [proposals and approvals](../design/platform/policy/approvals.md),
  [memory writes](../design/platform/memory/writes.md)

Memory has an approval path of its own design: memory proposals, and a write gate whose checks from
[0011](0011-memory-writes.md) decide whether a memory write applies at once or waits for your
review. Policy generalises memory's approval record and rule engine into one approval system, and
memory's write gate becomes an allow or ask rule on `memory.remember` and the other memory writes.
Your rules decide a memory write first, and the gate decides a write that no rule matches. Terms
follow the [glossary](../glossary.md).

## The one system

- **One record.** Every proposal takes the approval record from [0006](0006-approval-record.md),
  whatever its kind: an action, a memory write, or an internal change to policy, a mandate or a job.
  Each approval is bound to the hash of one exact operation and used once.
- **One answer path.** You answer a proposal of any kind through the same checked action in the
  client, a button bound to that one proposal. nixie refuses an answer whose hash no longer matches
  the proposal, or whose proposal is closed, the same way for each kind.
- **One place for rules.** The rules from [0004](0004-rule-engine.md) decide memory writes as they
  decide every other tool call.

The approval system is what happens after the
[decision point](../design/platform/policy/decision-point.md), the one function every tool calls
before it acts. Per [0008](0008-auto-mode.md), a call meets these layers in order:

1. The deterministic layers: rules, the always-ask set, the destination limits, and existing
   approvals.
2. The consent checker from [0028](0028-policy-design.md).
3. auto-mode, for the grey zone only.
4. Ask, which creates the proposal and the card.

Past approvals feed the deterministic layers and the counts of prompts by cause. auto-mode never
reads them: its inputs are the call, the task's scope, your last direct message, and whether the
caller is untrusted.

## Memory writes on rules

- **The `memory_write` effect.** Memory writes get their own
  [effect](../design/platform/policy/decision-point.md#effects), `memory_write`, on remember, edit
  and retire from the conversation and the [memory writer](../architecture/memory/writer.md), so the
  starter `allow-notes` rule never switches the gate off by accident. `allow-notes` matches the
  `note` effect, which stays on the harmless or proposal-producing writes inside nixie: skill writes
  and reloads, memory pin, unpin, rate and comment, consolidator suggestions, moments, self-notes,
  `task.message` and `task.start`.
- **The gate as the default.** When no rule matches a memory write, every check of the gate runs,
  and the checks decide whether the write applies at once with a notice and undo, or becomes a
  proposal.
- **Content sources.** Rules on `memory_write` can match the content source: `owner` for your own
  words, `own_data` for your own data, `task` for a task's message, and `outside` for outside
  content such as a web page. The starter rules allow none, so the gate runs in full by default. You
  may write a rule that allows any source, so that memories form on their own, with notices and undo
  as the safety net.
- **Security by tool list.** Security can rest mainly on each task's tool list with lax rules. A
  task without memory tools cannot write memory, because the decision point denies a tool that is
  not on the caller's list.

## Why

- With one record, one answer path and one place for rules, the hash check, the refusals and rule
  matching each exist once for every kind. You answer a memory proposal the way you answer an
  action, and you read every rule in one list.
- `allow-notes` allows every `note` call, so a write gate that became a rule on `note` would be off
  under the starter rules. A separate effect keeps the full gate until you write a rule for
  `memory_write`.
- The conversation holds both web fetch and the memory tools, so a rule that allows `outside` lets a
  poisoned page write a memory that every later prompt reads. The starter rules allow no source for
  that reason, and a rule that allows `outside` is a risk you choose.

## Alternatives

- **A separate memory approval flow.** Memory keeps its own proposal record, answer path and fixed
  gate beside the approval record. Each copy needs its own hash check, refusals and place in the
  approval digest, and your rules never reach a memory write.
- **The write gate as a rule on `note`.** It needs no new effect, and `allow-notes` then switches
  the gate off.

## Consequences

- An allow rule of yours that names a memory write tool, as 0011 permits, such as one on
  `memory.remember`, matches by tool name and so still covers `memory_write` calls of that tool.
- The [rule format](../design/platform/policy/rules.md#the-rule-format) gains a match field for the
  content source. The event log records 3 sources under
  [0005](0005-effects-and-taint.md#where-taint-applies): your words, your own data and outside
  content. `task` is not among them, so the rules design sets how a write's source resolves.
- `memory.remember` takes the item's subject as an argument, so it writes self-notes too. A tool's
  effects are fixed per tool, and self-notes keep `note`, so a self-note write needs a tool of its
  own that declares `note`.
