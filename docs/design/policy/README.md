# Policy design

Policy decides every tool call nixie makes: allow, ask or deny. The decision point runs a fixed
pipeline over rules, declared effects and destination limits, an ask becomes a proposal that you
answer in the client, and budgets bound what nixie spends.
[0028](../../decisions/0028-policy-design.md) records the policy choices.

- [The decision point](./decision-point.md) — the pipeline, effects, destination limits, consent,
  taint in the first build, auto-mode, the decision record and prompt causes
- [Rules](./rules.md) — the rule format, matching, evaluation order, rule identity, the snapshot
  hash, the widening check, proposed rules, mandates and the starter rule set
- [Proposals and approvals](./approvals.md) — the proposal and its action hash, risk classes, the
  approval, "always allow" and the approval digest
- [Budgets](./budgets.md) — budgets, lifting rules, model cost and the hard spending stop

The [policy rules spike](../../../spikes/policy-rules/README.md) prototypes the decision point, the
snapshot hash, the widening check and the scripted scenarios.
