# 0048: One approval system

- Date: 2026-10-31
- Status: decided
- Design: [proposals and approvals](../design/platform/policy/approvals.md),
  [memory writes](../design/platform/memory/writes.md)

Policy generalises memory's approval record and rule engine into one approval system, and memory's
write gate becomes an allow or ask rule on `memory.remember` and the other memory writes:

- **One record.** An action, a memory write and an internal change are 3 kinds of one proposal
  record under [0006](0006-approval-record.md), and an approval of any kind is bound to one exact
  operation and used once.
- **One answer path.** You answer every kind through the same checked action, and nixie checks the
  hash and refuses a stale or closed proposal the same way for each kind.
- **One place for rules.** The rules from [0004](0004-rule-engine.md) decide memory writes as they
  decide every other tool call.

The approval system is what happens after the decision point. Under [0008](0008-auto-mode.md), the
order is: the deterministic layers (rules, the always-ask set, the destination limits, and existing
approvals), then the consent checker, then auto-mode for the grey zone only, then ask, which creates
the proposal and the card. Past approvals feed the deterministic layer and the prompt-cause counts,
not auto-mode, whose inputs are the call, the task's scope, your last direct message and the
untrusted flag.

## Memory writes on rules

- **Their own effect.** Memory writes get their own effect, `memory_write`, on remember, edit and
  retire from the conversation and the memory writer, so the starter `allow-notes` rule never
  switches the gate off by accident. `note` keeps the harmless or proposal-producing writes inside
  nixie: skill writes and reloads, memory pin, unpin, rate and comment, consolidator suggestions,
  moments, self-notes, `task.message` and `task.start`.
- **The gate is the default.** When no rule matches a memory write, the gate from
  [0011](0011-memory-writes.md) runs as it is: its checks decide whether the write applies at once
  with a notice and undo, or becomes a proposal.
- **Rules can match the source.** Rules on `memory_write` can match the content source: `owner`,
  `own_data`, `task` or `outside`. The starter rules allow none, so the gate runs in full by
  default. You may write an organic rule that allows any source, with notices and undo as the safety
  net.
- **The tool list carries security.** Security can rest mainly on each task's tool list with lax
  rules: a task without memory tools cannot write memory, because the decision point denies a tool
  that is not on the caller's list.

## Why

- One record, one answer path and one place for rules mean that the hash check, the stale and closed
  refusals and rule matching each exist once, for every kind. You answer a memory proposal the way
  you answer an action, and you read every rule in one list.
- The starter rule `allow-notes` allows every `note` call, so a write gate that became a rule on
  `note` would be off under the starter rules. A separate effect keeps the full gate until you write
  a rule for `memory_write`.
- The conversation holds both web fetch and the memory tools, so an allow on `outside` lets a
  poisoned page write a memory that every later prompt reads. The starter rules allow no source for
  that reason, and a rule that allows `outside` is a risk you choose.

## Alternatives

- **A separate memory approval flow.** Memory keeps its own proposal record, answer path and fixed
  gate beside policy's. Each copy needs its own hash check, refusals and digest handling, and no
  rule of yours reaches a memory write.
- **The write gate as a rule on `note`.** It needs no new effect, and the starter rule `allow-notes`
  then switches the gate off.

## Consequences

- The allow rules from 0011 that name a memory write tool are ordinary rules on `memory_write`
  calls.
- The rule format gains a match field for the content source. `task` is not one of the 3 sources
  that the event log records under [0005](0005-effects-and-taint.md#where-taint-applies), so the
  rules design sets how a write's source resolves.
- `memory.remember` takes the subject, so it writes self-notes too, and a tool's effects are fixed
  per tool under the [decision point design](../design/platform/policy/decision-point.md#effects).
  Self-notes keep `note`, so a self-note write needs a route that does not declare `memory_write`.
