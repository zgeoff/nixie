# 0048: One approval system

- Date: 2026-10-31
- Status: decided
- Design: [proposals and approvals](../design/platform/policy/approvals.md),
  [memory writes](../design/platform/memory/writes.md)

Policy generalises memory's approval record and rule engine into one approval system. Memory's write
gate, the checks from [0011](0011-memory-writes.md) that decide whether a memory write applies at
once or waits for your review, becomes an allow or ask rule on `memory.remember` and the other
memory writes. The one system has 3 parts:

- **The record.** Every proposal takes the approval record from [0006](0006-approval-record.md),
  whatever its kind: an action, a memory write, or an internal change, such as a widened rule. Each
  approval is bound to one exact operation and used once.
- **The answer path.** You answer a proposal of any kind through the same checked action in the
  client. nixie checks the operation's hash, and refuses a stale or closed proposal, the same way
  for each kind.
- **The rules.** The rules from [0004](0004-rule-engine.md) decide memory writes as they decide
  every other tool call, through the [decision point](../design/platform/policy/decision-point.md).

The approval system is what happens after the decision point. The order follows
[0008](0008-auto-mode.md):

1. The deterministic layers: rules, the always-ask set, the destination limits, and existing
   approvals.
2. The consent checker from [0028](0028-policy-design.md).
3. auto-mode, for the grey zone only.
4. Ask, which creates the proposal and the card.

Past approvals feed the deterministic layers and the prompt-cause counts. auto-mode never reads
them: its inputs are the call, the task's scope, your last direct message and the untrusted flag.

## Memory writes on rules

- **The effect.** Memory writes get their own
  [effect](../design/platform/policy/decision-point.md#effects), `memory_write`. `memory.remember`,
  `memory.edit` and `memory.retire` declare it, whether the conversation or the memory writer calls
  them, so the starter rule `allow-notes`, which allows every `note` call, never switches the gate
  off by accident. `note` stays the effect of the harmless or proposal-producing writes inside
  nixie: skill writes and reloads, memory pin, unpin, rate and comment, consolidator suggestions,
  moments, self-notes, `task.message` and `task.start`.
- **The default.** When no rule matches a memory write, the gate runs in full: its checks decide
  whether the write applies at once with a notice and undo, or becomes a proposal.
- **Content sources.** A rule on `memory_write` can match where the write's content came from:
  `owner`, `own_data`, `task` or `outside`. The starter rules allow none of them, so the gate runs
  in full by default. You may write a rule that allows any source, so that memories form on their
  own, with notices and undo as the safety net.
- **Security.** Each task's tool list carries most of the security, so the rules can stay lax: a
  task without memory tools cannot write memory, because the decision point denies a tool that is
  not on the caller's list.

## Why

- With one record, one answer path and one place for rules, the hash check, the stale and closed
  refusals and rule matching each exist once for every kind. You answer a memory proposal the way
  you answer an action, and you read every rule in one list.
- `allow-notes` allows every `note` call, so a write gate that became a rule on `note` would be off
  under the starter rules. A separate effect keeps the full gate until you write a rule for
  `memory_write`.
- The conversation holds both web fetch and the memory tools, so a rule that allows `outside` lets a
  poisoned page write a memory that every later prompt reads. The starter rules allow no source for
  that reason, and a rule that allows `outside` is a risk you choose.

## Alternatives

- **A separate memory approval flow.** Memory keeps its own proposal record, answer path and fixed
  gate beside the approval record. Each copy needs its own hash check, refusals and place in the
  approval digest, and no rule of yours reaches a memory write.
- **The write gate as a rule on `note`.** It needs no new effect, and `allow-notes` then switches
  the gate off.

## Consequences

- An allow rule from 0011 that names a memory write tool, such as `memory.remember`, matches
  `memory_write` calls of that tool, as any rule matches by tool name.
- The [rule format](../design/platform/policy/rules.md#the-rule-format) gains a match field for the
  content source. `task` is not one of the 3 sources that the event log records under
  [0005](0005-effects-and-taint.md#where-taint-applies), so the rules design sets how a write's
  source resolves.
- `memory.remember` takes the item's subject as an argument, so it writes self-notes too, and a
  tool's effects are fixed per tool. Self-notes keep `note`, so a self-note write needs a tool of
  its own that declares `note`.
