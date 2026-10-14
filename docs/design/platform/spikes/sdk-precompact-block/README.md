# Spike: block the SDK's automatic compaction from a PreCompact hook

This spike checks whether a `PreCompact` hook that returns `decision: 'block'` stops the Agent SDK's
automatic compaction, so that nixie's own compactor stays the only way a session shrinks. The
[compactor design](../../core/session-opening.md#the-compactor) and the
[compaction section](../../memory/context.md#compaction) rely on the answer.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.300
- Model: `claude-haiku-4-5-20251001`
- Options on every run: `tools: []`, `settingSources: []`, `maxTurns: 1`, a `CLAUDE_CONFIG_DIR` of
  its own, an `env` that passes only `PATH`, `HOME`, the OAuth token and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, and a `PostCompact` callback hook that records each
  compaction that runs

## Questions

1. Does `decision: 'block'` from the `PreCompact` hook stop an automatic compaction?
2. What happens when a blocked session then grows past the model's context window?

## Run it

Run the command from this directory. The script runs 9 model calls, about $1.75 at API prices, and
prints a block per turn.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file precompact-block.ts "$(mktemp -d)"
```

The seed builds one session of 5 turns, each a pasted block of about 21,000 tokens, under the
default auto-compact window. Forks A, B and C each resume the seed with `forkSession: true` and
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000`, so the 105,000-token context passes the window before the
fork's one short question. Fork D resumes C's session and pastes about 100,000 tokens more, past the
model's 200,000-token window.

| Fork | `PreCompact` hook                       |
| ---- | --------------------------------------- |
| A    | none                                    |
| B    | returns `{}`                            |
| C    | returns `{ decision: 'block', reason }` |
| D    | returns `{ decision: 'block', reason }` |

## Answers

- Yes, for the automatic compaction that fires at the window. Fork C called the hook once with
  `trigger: 'auto'`, wrote no `compact_boundary` to the stream or the transcript, never called
  `PostCompact`, and sent all 104,917 tokens of context to the model. Fork A compacted 104,984
  tokens to 1,214 and fork B to 1,190. Both wrote one boundary and one summary and called
  `PostCompact`, so the hook's call alone does not block.
- A blocked compaction still emits a `status: 'compacting'` message, then `status: null` with no
  `compact_result`. A compaction that ran ends with `compact_result: 'success'`.
- Past the window, the turn fails. Fork D called the hook twice, once for the window and once to
  recover from the API's refusal, and both returned block. The result message has
  `subtype: 'success'`, `is_error: true` and the text `Prompt is too long`, and `query()` then threw
  `Claude Code returned an error result: Prompt is too long`. The transcript keeps the pasted prompt
  and no compaction.
- A context that is one long message cannot compact at all. A first version of the run seeded one
  104,000-token message. Every fork then reported `compact_result: 'failed'` with
  `compact_error: 'too_few_groups'`, and the hook had nothing to block. The 5-turn seed fixed the
  control.

The [hooks reference](https://code.claude.com/docs/en/hooks#precompact) describes the same two
cases: a blocked compaction before the limit leaves the conversation uncompacted, and a blocked
compaction meant to recover from a context-limit error lets that error fail the request.

The model's answers are not evidence here. It read the pasted notes as an injection attempt and
refused to list the code words, so the input token count and the compaction records decide each
fork.

```text
seed 5: session=2cbb2d77 result=success is_error=false
  input tokens=104624 cost=$0.2372
  hooks=[]
  stream compact_boundary=[] status=[]
A control, no hook: session=a834619e result=success is_error=false
  input tokens=1469 cost=$0.2746
  hooks=[PostCompact:auto->{}]
  stream compact_boundary=[auto pre=104984 post=1214] status=[compacting, null (success)]
  transcript A control, no hook: entries=54 compact_boundary=1 summaries=1
B hook returns {}: session=db66e2d8 result=success is_error=false
  input tokens=1406 cost=$0.2755
  hooks=[PreCompact:auto->{}, PostCompact:auto->{}]
  stream compact_boundary=[auto pre=104984 post=1190] status=[compacting, null (success)]
  transcript B hook returns {}: entries=54 compact_boundary=1 summaries=1
C hook returns block: session=78b4998c result=success is_error=false
  input tokens=104917 cost=$0.2494
  hooks=[PreCompact:auto->{"decision":"block","reason":"nixie compacts the session itself"}]
  stream compact_boundary=[] status=[compacting, null]
  transcript C hook returns block: entries=47 compact_boundary=0 summaries=0
D block, past the window: session=cc535344 result=success is_error=true "Prompt is too long" threw: Error: Claude Code returned an error result: Prompt is too long
  input tokens=0 cost=$0.2494
  hooks=[PreCompact:auto->{"decision":"block",...}, PreCompact:auto->{"decision":"block",...}]
  stream compact_boundary=[] status=[compacting, null, compacting, null]
  transcript D block, past the window: entries=51 compact_boundary=0 summaries=0
```

## Recommendation

nixie can rely on a `PreCompact` hook that returns block for every `trigger: 'auto'` call. The
compactor's turn then sees the uncompacted session, and a turn that overflows the window fails with
an `is_error` result of `Prompt is too long`, which the compactor's overflow path matches to compact
from the last committed boundary and run the turn again. The hook leaves `trigger: 'manual'` alone,
because nixie sends no `/compact`.

## Untested

- Turning auto-compaction off through settings (`autoCompactEnabled: false`) or the environment, and
  whether the hook still fires then.
- Idle compaction, which the hooks reference also reports as `trigger: 'auto'`. Each fork here ran
  one turn and then closed.
- A command hook that exits with code 2, the other documented form of block.
- An overflow inside a turn that ends in tool calls, rather than from the user's prompt.
- Any SDK version other than 0.3.300; nixie pins 0.3.290.
