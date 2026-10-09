# Policy design

The policy design covers how nixie decides every tool call: the decision point and its stages, the
rules it reads, the proposals and approvals it creates, and the budgets that bound spending. Each
doc links the decisions it rests on, and the decision point ends with the choices the owner settled
in [0028](../../decisions/0028-policy-design.md).

- [The policy decision point](./decision-point.md) — the pipeline, declared effects, the always-ask
  set, destination limits and consent, taint in the first build, auto-mode, prompt causes and the
  scripted scenarios
- [Rules](./rules.md) — the rule format and matching, evaluation order, rule identity, the snapshot
  hash, the widening check, gaps and proposed rules, grants with expiries, and the starter rule set
- [Proposals and approvals](./approvals.md) — the proposal and its action hash, risk classes, the
  approval record, "always allow", and the digest sheet's contents and order
- [Budgets, lifts and the spending stop](./budgets.md) — budgets, lifting rules, limits on model
  cost, and the hard spending stop

The [policy rules spike](../../../spikes/policy-rules/README.md) prototypes the decision point, the
snapshot hash, the widening check and the scenarios.
