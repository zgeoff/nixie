# Spike: a pinned memory core in the system prompt

This spike checks when a change to a session's system prompt reaches a resumed session, which sets
where the pinned memory core lives in the
[memory in context design](../../docs/design/memory/context.md#the-pinned-core).

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.293
- Model: `claude-haiku-4-5-20251001`
- Options on every run: `tools: []`, `settingSources: []`, `maxTurns: 1`, a `CLAUDE_CONFIG_DIR` of
  its own, and an `env` that passes only `PATH`, `HOME`, the OAuth token and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, as in the
  [resume-at spike](../sdk-resume-at/README.md)

## Questions

1. The SDK's type docs say a session records its system prompt on the first request and ignores a
   changed prompt on a later resume until compaction. Does a resume with a changed prompt answer
   from the recorded one?
2. Does `snapshot: false` make a resume answer from the changed prompt?
3. Does a fork with `resumeSessionAt` and `forkSession: true` render the prompt afresh?
4. What does each change cost the prompt cache, in cache reads and cache writes?

## Run it

Run the command from this directory. The script runs 7 model calls and prints one line per turn,
with the answer and the cache tokens from each result.

```bash
bun install
env -u ANTHROPIC_API_KEY bun --env-file=../../.env pinned-core.ts "$(mktemp -d)"
```

[pinned-core.ts](./pinned-core.ts) puts about 3,000 tokens of stable text and a code word in the
system prompt, then changes the code word between resumes.

## Answer

Not run yet. The first run stopped at its first call on the subscription's weekly limit, so the
script is untested against the model. The memory design assumes `snapshot: false` re-renders the
prompt on every request, as the SDK's type docs state, and gives a fork as the fallback if it does
not.

## Untested

- Everything above, until the script runs.
- Whether system-prompt recording is enabled for the account at all: the type docs say it is rolling
  out, and that `snapshot` has no effect where it is not.
- A session that compacts after the prompt changes.
