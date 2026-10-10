# 0028: The policy design

- Date: 2026-10-09
- Status: decided
- Design: [decision point](../design/policy/decision-point.md), [rules](../design/policy/rules.md),
  [proposals and approvals](../design/policy/approvals.md), [budgets](../design/policy/budgets.md)
- Research: [policy rules spike](../../spikes/policy-rules/)

nixie's policy design settles these choices:

- **nixie's own consent checker, always on.** A checker model that nixie builds confirms that your
  direct message asked for an action, whether auto-mode is on or off. It sees your message and the
  action as structured fields, never tool output. Consent covers an action with no named destination
  on the checker's word, while ask rules still catch what you want asked, such as deleting for good.
- **The hard spending stop as a counting proxy on the host.** Every model request passes through a
  proxy on nixie's host that counts the cost and refuses requests once a deployment budget is spent,
  and fails closed. A spend limit set with the model provider, where one exists, backs it up.
- **YAML rule files.** Rules, budgets and effect declarations in the definitions repo are YAML,
  checked against a JSON Schema that nixie generates from the rule format, both when the definitions
  seed the database and when nixie exports runtime rules.
- **A permissive starter rule set, with notices for jobs.** The starter set allows reads, notes,
  writes the service can restore, sends within the destination limits, code runs and narrowing
  changes, and asks before deleting for good and before exporting. No starter rule allows or asks
  for creating a job:
  - a job you ask for passes by consent, including one whose tools send
  - a job nobody asked for asks
  - a job whose tools delete for good or spend still asks, because its tools' effects meet your ask
    rule and the always-ask set before consent

  Every job creation or change posts a notice with undo, and the live view lists every job.

## Why

- Without a checker of its own, every direct request that no rule covers would ask until auto-mode
  is on, and [0005](./0005-effects-and-taint.md) counts such a prompt as a defect. The checker sees
  no tool output, so injected content cannot reach it.
- The SDK's own budget cap runs inside the imp, next to code that reads untrusted content, and the
  runner's checks between steps let a looping turn overshoot. A proxy on the host enforces budgets
  mid-turn, and the provider's limit catches a fault in the proxy.
- A list of rules with nested checks is readable in YAML, YAML allows comments, and Bun parses it
  natively. The schema catches the mistakes that hand edits make.
- In the spike, the starter set raised 15 prompts over 14 scripted scenarios, each one intended,
  against 21 for a set that asks before every write and send.
- A job acts long after the conversation that made it, so a notice and a list keep every job in
  sight.

## Alternatives

- **auto-mode's consent assessment only.** It needs no second checker, and it leaves consent off
  whenever auto-mode is.
- **The runner's checks alone, or the provider's limit alone.** The first overshoots by a turn, and
  the second sits off your host and depends on the provider.
- **TOML, JSON or TypeScript rule files.** TOML grows verbose for nested lists, JSON allows no
  comments, and a TypeScript file is code that a seed would have to run.
- **A cautious starter set, or one that allows quiet jobs.** The cautious set asks on every run of a
  routine job. A rule that allows quiet jobs lets a steered task schedule work nobody asked for.
- **A starter rule that asks before creating a job that sends.** It adds one deliberate yes for a
  job that acts on your behalf, and prompts for a job you already asked for.

## Consequences

- The consent checker and the memory checker from [0011](./0011-memory-writes.md) can share one
  implementation with different prompts.
- The proxy needs imp's broker to forward model requests through it, which a spike on an imp host
  checks before the first build relies on it.
- What cost means on a subscription token, and the budget defaults, are open items.
