# 0028: The policy design

- Date: 2026-10-09
- Status: decided
- Amends: [0005](./0005-effects-and-taint.md)
- Design: [policy decision point](../design/policy/decision-point.md),
  [rules](../design/policy/rules.md), [proposals and approvals](../design/policy/approvals.md),
  [budgets](../design/policy/budgets.md)
- Research: [policy rules spike](../../spikes/policy-rules/)

nixie settles the open choices in its policy design as follows:

- **nixie's own consent checker, always on.** A checker model that nixie builds confirms that the
  owner's direct message asked for an action, whether auto-mode is on or off. It sees the owner's
  message and the action as structured fields, never tool output. Consent covers an action with no
  named destination on the checker's word, while ask rules still catch what the owner wants asked,
  such as deleting for good.
- **A sixth prompt cause: the owner's ask rule.** A prompt that a rule the owner wrote asked for
  records this cause, and nixie counts it apart from the 0-prompt target. This amends the list of 5
  causes in [0005](./0005-effects-and-taint.md).
- **The hard spending stop as a counting proxy on the host.** Every model request passes through a
  proxy on nixie's host that counts the cost and refuses requests once a deployment budget is spent,
  and fails closed. A spend limit set with the model provider, where one exists, backs it up.
- **"Approve all" for routine items only.** On the digest sheet from
  [0006](./0006-approval-record.md), each item in the always-ask set or lifting it takes its own
  approval.
- **YAML rule files.** Rules, budgets and effect declarations in the definitions repo are YAML,
  checked against a JSON Schema that nixie generates from the rule format, both when the repo seeds
  the database and when nixie exports runtime rules.
- **A permissive starter rule set, with notices for jobs.** The starter set allows reads, notes,
  writes the service can restore, sends within the destination limits, sandboxed code and narrowing
  changes, and asks before deleting for good, before exporting, and before creating a job whose
  tools send or delete. No starter rule allows creating a job: a job the owner asks for runs through
  consent, and a job nobody asked for asks. Every job creation or change posts a notice with undo,
  and the live view lists every job.

## Why

- Without a checker of its own, every direct request that no rule covers would ask until auto-mode
  is on, and 0005 counts such a prompt as a defect. The checker sees no tool output, so injected
  content cannot reach it.
- A prompt the owner asked for is neither a gap nor a defect. Counting it as a gap would have nixie
  propose rules that undo the owner's own.
- The SDK's own budget cap runs inside the imp, next to code that reads untrusted content, and the
  runner's checks between steps let a looping turn overshoot. A proxy on the host enforces the
  owner's budgets mid-turn, and the provider's limit catches a fault in the proxy.
- A purchase or a widened rule hidden in a batch is the case that distinct rendering under
  [0023](./0023-lifting-always-ask.md) exists to prevent.
- A list of rules with nested checks is readable in YAML, YAML allows comments, and Bun parses it
  natively. The schema catches the mistakes that hand edits make.
- The starter set raised 16 prompts over 14 scripted scenarios, each one intended, against 22 for a
  set that asks before every write and send, whose 6 extra prompts all came from one run of an inbox
  job ([policy rules spike](../../spikes/policy-rules/), 2026-10-09).
- A job acts long after the conversation that made it, so a notice and a list keep every job in the
  owner's sight.

## Alternatives

- **auto-mode's consent assessment only.** It needs no second checker, and it leaves consent off
  whenever auto-mode is.
- **Prompts from ask rules counted as "no rule matched".** It keeps 5 causes, and mixes the owner's
  own prompts with the gaps nixie tries to close.
- **The runner's checks alone, or the provider's limit alone.** The first overshoots by a turn, and
  the second sits off the owner's host and depends on the provider.
- **"Approve all" for every item behind one passkey check.** It saves taps when several purchases
  queue, and hides each one in the batch.
- **TOML, JSON or TypeScript rule files.** TOML grows verbose for nested lists, JSON allows no
  comments, and a TypeScript file is code that a seed would have to run.
- **A cautious starter set, or one that allows quiet jobs.** The cautious set asks on every run of a
  routine job. A rule that allows quiet jobs lets a steered task schedule work the owner never asked
  for.

## Consequences

- The consent checker and the memory checker from [0011](./0011-memory-writes.md) can share one
  implementation with different prompts.
- The event log records one of 6 prompt causes.
- The proxy needs imp's broker to forward model requests through it, which a spike on an imp host
  checks before the first build relies on it.
- The client renders a notice with undo for each job creation or change, and the live view gains a
  list of jobs.
