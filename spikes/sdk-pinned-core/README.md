# Spike: a pinned memory core in the system prompt

This spike checks when a change to a session's system prompt reaches a resumed session, which sets
where the pinned memory core lives in the
[memory in context design](../../docs/design/memory/context.md#the-pinned-core).

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.293
- Model: `claude-haiku-4-5-20251001`
- Options on every run: `tools: []`, `settingSources: []`, `maxTurns: 1`, a `CLAUDE_CONFIG_DIR` of
  its own, SDK auto-memory and auto-dream disabled, and an `env` that passes only `PATH`, `HOME`,
  the OAuth token and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, as in the
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
NIXIE_SPIKE_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
CLAUDE_CODE_OAUTH_TOKEN="$NIXIE_SPIKE_TOKEN" bun --no-env-file pinned-core.ts "$(mktemp -d)"
unset NIXIE_SPIKE_TOKEN
```

[pinned-core.ts](./pinned-core.ts) puts about 3,000 tokens of stable text and a code word in the
system prompt, then changes the code word between resumes.

## Answer

Each line is one turn: the code word the prompt holds, the answer, and the cache tokens.

```text
1 new session, APPLE: answer="APPLE" cacheRead=0 cacheWrite=4173
2 resume, same prompt: answer="APPLE" cacheRead=4173 cacheWrite=111
3 resume, BANANA, default snapshot: answer="APPLE" cacheRead=4284 cacheWrite=115
4 resume, BANANA, snapshot false: answer="BANANA" cacheRead=0 cacheWrite=4504
5 resume, BANANA, snapshot false again: answer="BANANA" cacheRead=4504 cacheWrite=178
6 fork at turn 1, CHERRY, default snapshot: answer="APPLE" cacheRead=4284 cacheWrite=0
7 resume original, CHERRY, default snapshot: answer="APPLE" cacheRead=4399 cacheWrite=396
```

1. Yes. System-prompt recording is on for this account: after a resume with a changed prompt, the
   model answers from the recorded one (turn 3).
2. Yes. With `snapshot: false` on the resume, the model answers from the changed prompt (turn 4).
   The option applies only to the call that sets it. After a later resume without it, the model
   answers from the recorded prompt again (turn 7), so nixie sets it on every `query()`.
3. No. A fork with `resumeSessionAt` and `forkSession: true` keeps the recorded prompt (turn 6), so
   a fork with the default snapshot is no fallback for a changed core.
4. A changed prompt costs one full cache write of the prefix, about 4,500 tokens here (turn 4). The
   next turn with the same prompt reads the prefix from the cache again (turn 5).

## Untested

- A fork with `snapshot: false`.
- A session that compacts after the prompt changes.
- A model behind a non-Anthropic endpoint, such as GLM through `ANTHROPIC_BASE_URL`: whether
  recording and `snapshot` apply there at all. The type docs tie recording to the account, and the
  run above used only the subscription.
