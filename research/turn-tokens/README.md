# Spike: token use per turn

This spike measures the input, cache write, cached input and output tokens of a turn for each model
role, through the production guest code and a local stand-in for the counting proxy. Its numbers set
the [model cost](../../docs/design/platform/policy/budgets.md#model-cost) defaults.

## Question

How many input, cached input and output tokens does a turn use, for each model role, and what
spending limits follow from them?

## Answer

- A turn's tokens come to about its model calls times its context: a conversation turn makes 1.6 to
  2.1 model calls, and every call re-reads the whole session from the cache.
- The Opus conversation's context grew by about 1,200 tokens a turn from a fixed part of about 5,800
  tokens, and its mean turn counted 26,242 tokens.
- Every cache entry the CLI wrote lived 5 minutes, so a turn after a pause rewrites its context to
  the cache, at about 13 times the cost of a warm turn.
- A heavy day of 100 turns counts about 38,000,000 tokens and costs about $31 on Opus 5.5. The
  checker, the memory writer and the consolidator add about 3% to an ordinary day.

Set each budget default to about twice the heaviest legitimate use or more, as the
[budget defaults](results.md#budget-defaults) list.

## Run it

Run from this directory, on a host whose egress adds the model credential, such as an imp sandbox.

```bash
bun install
bun run.ts conversation claude-opus-5-5 medium
bun run.ts memory-writer claude-haiku-5-5 low
bun report.ts
```

The [setup](results.md#setup) gives the versions, the roles, the fixtures and the cold-turn option.

## Results

The [results](results.md) hold the table of tokens and cost per role, the projections for a day, and
the budget defaults.

## Untested

Real conversations, the `task` and `worker` roles as built, and a session near the compaction
window. The [untested list](results.md#untested) gives the rest.
