# Spike: the rule engine, the snapshot hash and the prompt scenarios

This spike prototypes the policy decision point from the
[policy design](../../docs/design/platform/policy/decision-point.md) in TypeScript, with no
dependency. It runs the prototype over sample tool calls, reordered definitions, rule edits and
scripted scenarios, against decisions [0004](../../docs/decisions/0004-rule-engine.md) and
[0005](../../docs/decisions/0005-effects-and-taint.md).

## Question

Does every tool call get exactly one decision whatever the rule order, does the snapshot hash hold
across equivalent definitions and move on every real change, can code tell whether a rule edit
widens access, and how many prompts do scripted scenarios raise against the starter rule set with
auto-mode off?

## Answer

- All 108 sample calls got exactly one decision, and none changed under 200 rule orders; 9 fell
  through to "no rule matched".
- The snapshot hash held across 1,000 equivalent reorderings and moved on each of 18 real changes.
- The widening check classified 26 of 27 rule edits correctly, and its one miss reported a narrowing
  as widening, which costs a prompt and never access.
- The 14 scenarios raised 15 prompts against the starter set, none from a direct request or a
  repeat, and every one a prompt the design intends.
- A cautious starter set raised 21 prompts, all 6 extra ones from the inbox job.

Keep the starter rule set, because the cautious one prompts on every run of a recurring inbox job.

## Run it

```bash
cd research/policy-rules
bun run spike
STARTER=cautious bun scenarios.ts
```

The [setup](results.md#setup) gives the versions, each script, and what the cautious run changes.

## Results

The [results](results.md) hold the output for each question and the prompts by cause.

## Untested

Real tools, a real model and a real consent checker, and auto-mode. The
[untested list](results.md#untested) gives the rest.
