# Spike: a pinned memory core in the system prompt

This spike checks when a change to a session's system prompt reaches a resumed session, which sets
where the pinned memory core lives in the
[memory in context design](../../docs/design/memory/context.md#the-pinned-core).

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.293
- Models: `claude-haiku-4-5-20251001` on the subscription, and `glm-5.3` through Z.ai's
  Anthropic-compatible endpoint
- Options on every run: `tools: []`, `settingSources: []`, `maxTurns: 1`, a `CLAUDE_CONFIG_DIR` of
  its own, SDK auto-memory and auto-dream disabled, and an `env` that passes only `PATH`, `HOME`,
  the model's credential and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, as in the
  [resume-at spike](../sdk-resume-at/README.md)

## Questions

1. The SDK's type docs say a session records its system prompt on the first request and ignores a
   changed prompt on a later resume until compaction. Does a resume with a changed prompt answer
   from the recorded one?
2. Does `snapshot: false` make a resume answer from the changed prompt?
3. Does a fork with `resumeSessionAt` and `forkSession: true` render the prompt afresh?
4. What does each change cost the prompt cache, in cache reads and cache writes?

## Run it

Run the commands from this directory. The script runs 7 model calls and prints one line per turn,
with the answer and the cache tokens from each result. [provider.ts](./provider.ts) picks the model:
Haiku by default, or GLM 5.3 when `NIXIE_SPIKE_PROVIDER` is `glm`.

```bash
bun install
# Haiku, with the Claude token from the vault
NIXIE_SPIKE_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
CLAUDE_CODE_OAUTH_TOKEN="$NIXIE_SPIKE_TOKEN" bun --no-env-file pinned-core.ts "$(mktemp -d)"
unset NIXIE_SPIKE_TOKEN
# GLM 5.3, with the Z.ai key from the vault, through the logging proxy
export ZAI_API_KEY=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/zai-api-key/credential'
)
bun --no-env-file log-proxy.ts &
NIXIE_SPIKE_PROVIDER=glm NIXIE_SPIKE_BASE_URL=http://127.0.0.1:47900 \
  env -u CLAUDE_CODE_OAUTH_TOKEN bun --no-env-file pinned-core.ts "$(mktemp -d)"
kill %1
unset ZAI_API_KEY
```

`--variant note` and `--variant note-only` run turns 1 to 3 as above, then 2 more turns with the
change note that the [change note](#a-change-note) section describes:

```bash
NIXIE_SPIKE_PROVIDER=glm env -u CLAUDE_CODE_OAUTH_TOKEN \
  bun --no-env-file pinned-core.ts "$(mktemp -d)" --variant note
```

[pinned-core.ts](./pinned-core.ts) puts about 3,000 tokens of stable text and a code word in the
system prompt, then changes the code word between resumes. [log-proxy.ts](./log-proxy.ts) forwards
to Z.ai and logs the code word each request's system prompt holds, so a run shows what the model
received beside what it answered.

## Answer

Claude Code sends the changed prompt on both models. Haiku follows it every time, and GLM 5.3 often
answers from its own earlier turns instead.

### Haiku 4.5

Each line is one turn: the code word the prompt holds, the answer, and the cache tokens. 2 more runs
gave the same answers on every turn.

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

### GLM 5.3

Recording and `snapshot` work the same way on GLM, because Claude Code applies them before the
request leaves. The logging proxy showed the same system prompts on all 4 runs through it: APPLE on
turns 1 to 3, BANANA on turns 4 and 5, and APPLE on the fork and on turn 7. One run through the
proxy:

```text
#4 system_word=BANANA messages=11
4 resume, BANANA, snapshot false: answer="BANANA" cacheRead=3840 cacheWrite=0
#7 system_word=APPLE messages=17
7 resume original, CHERRY, default snapshot: answer="BANANA" cacheRead=3840 cacheWrite=0
```

GLM's answers do not track the prompt it receives. Across 5 runs:

| Turn                       | Prompt holds | GLM answered the prompt's word | Haiku, 3 runs |
| -------------------------- | ------------ | ------------------------------ | ------------- |
| 4, first `snapshot: false` | BANANA       | 2 of 5                         | 3 of 3        |
| 5, `snapshot: false` again | BANANA       | 3 of 5                         | 3 of 3        |
| 7, recorded prompt again   | APPLE        | 2 of 5                         | 3 of 3        |

In the other runs GLM repeated the word from its own earlier answers. A changed pinned core reaches
GLM's request, but GLM does not reliably act on it in a session whose history holds the old word.
Z.ai reports no cache writes, and its cache reads stay at about 3,400 to 3,900 tokens across the
change.

### A change note

A note on the turn after the core changes makes GLM follow the change. The note goes before that
turn's user message, and the next turn carries no note:

```text
<system-reminder>
Your pinned memory changed. Current: Pinned memory: the owner's code word is BANANA.
</system-reminder>
```

Both variants run turns 1 to 3 as before, so the history holds 3 APPLE answers. Turn 4 carries the
note, and turn 5 resumes without it:

| Variant     | System prompt on turns 4 and 5 | Model | Turn 4 answered BANANA | Turn 5 answered BANANA |
| ----------- | ------------------------------ | ----- | ---------------------- | ---------------------- |
| `note`      | BANANA, `snapshot: false`      | GLM   | 5 of 5                 | 5 of 5                 |
| `note`      | BANANA, `snapshot: false`      | Haiku | 3 of 3                 | 3 of 3                 |
| `note-only` | APPLE, unchanged               | GLM   | 5 of 5                 | 5 of 5                 |
| none        | BANANA, `snapshot: false`      | GLM   | 2 of 6                 | 3 of 6                 |

The note does the work on GLM: with the note alone and the old prompt, GLM answered BANANA every
time, and kept it on the turn after. A sixth base run beside these gave APPLE on both turns.

The note costs 35 input tokens on Haiku and 31 on GLM, measured on a fresh session with and without
it, once per change.

## Untested

- A fork with `snapshot: false`.
- A session that compacts after the prompt changes.
- A change note on a real pinned core of several items, and on a session that runs for days.
