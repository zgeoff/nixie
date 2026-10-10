# 0008: auto-mode decides the grey zone

- Date: 2026-10-08
- Status: decided
- Research:
  [auto-mode decision model](https://github.com/zgeoff/auto-mode/blob/main/docs/architecture/decision-model.md)

nixie uses auto-mode's core library to decide the actions that its deterministic policy leaves open.
nixie's own layers decide first: the rules from [0004](./0004-rule-engine.md), the always-ask set
and the destination limits from [0005](./0005-effects-and-taint.md), and the approval record from
[0006](./0006-approval-record.md). An action that none of them settles goes to auto-mode, which
allows it or denies it with a reason. The model reads the reason and takes another path. A prompt
reaches you only when auto-mode's denial budget runs out.

## What nixie needs from auto-mode

- **Inputs:** the tool call, the task's scope, your last direct message, and whether the caller is
  untrusted. Under [0015](./0015-taint-scope.md), the conversation and every job run are.
- **Outputs:** allow, or deny with a reason that holds the rule, what it refused, and what would
  clear it.
- **Final deterministic layers.** auto-mode never overrides a decision that nixie's own layers made,
  and a test proves it.
- **Fails closed.** A timeout, an unreadable answer or a missing verdict counts as a deny.
- **A full record.** Each decision records the stage that made it, its reason and its inputs, so the
  decision can be replayed and measured.

## Measured bar

nixie runs completely without auto-mode. In that mode, an action that no deterministic layer settles
asks. nixie switches auto-mode on when auto-mode's own measurements meet nixie's bar on nixie's
scenarios, not only on coding traffic:

- catastrophic actions allowed, per stage
- harmless denials per action
- consent credited, and near-misses held
- escalations to you per task

## Why

- The deterministic layers bound auto-mode's failures. A wrong allow stays inside the grey zone: it
  cannot spend money, widen a rule, send to a destination that the limits hold back, or override a
  deny. A wrong deny costs friction, and the model gets a reason to try another path.
- A deny with a reason serves the 0-prompt target better than a prompt.
- auto-mode is a library for other software to call, and it gates your coding sessions too, so nixie
  and those sessions need the same thing from it.

## Alternatives

- **Deterministic policy only.** Every action that no rule covers asks. It is the mode nixie falls
  back to, and it carries more prompts.
- **A classifier as the main gate,** as Claude Code auto mode works. Its misses are bounded only by
  the classifier, which has a 17% false-negative rate on real overeager actions
  ([Anthropic engineering](https://www.anthropic.com/engineering/claude-code-auto-mode)).

## Consequences

- The principle "Policy is deterministic" reads as: deterministic policy is final, and a model
  decides only what it leaves open.
- A grey-zone call costs a classifier call, and each deny costs a review, in tokens and seconds.
