# Spike: resume a session at a given message

This spike checks whether an Agent SDK session can resume or fork from a given message, so that a
task's rerun after a crash drops the turn that never committed. The
[tasks design](../../core/tasks.md#crash-recovery) relies on the answer.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.293
- Model: `claude-haiku-4-5-20251001`
- Options on every run: `tools: []`, `settingSources: []`, `maxTurns: 1`, a `CLAUDE_CONFIG_DIR` of
  its own, and an `env` that passes only `PATH`, `HOME`, the OAuth token and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`

## Questions

1. Does the SDK offer a resume or fork from a given message, and under which names?
2. Does a resume at turn 1's last message drop a later turn, in what the model reads?
3. Does the same hold after a turn that was aborted mid-answer?
4. Does the original session stay intact?

## Run it

Run the command from this directory. The script runs 7 model calls and prints one line per turn.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file resume-at.ts "$(mktemp -d)"
```

## Answers

- The SDK offers 2 routes, both in `sdk.d.ts`. `query()` takes `resumeSessionAt`, which resumes
  "only messages up to and including the message with this UUID", together with `resume` and
  `forkSession`. `forkSession(sessionId, { upToMessageId })` copies the transcript up to that
  message into a new session.
- Both routes drop the later turn. Turn 1 sets the code word APPLE and turn 2 changes it to BANANA.
  A resume at turn 1's last assistant message answers APPLE, and so does a plain resume of a fork
  cut at that message.
- A turn aborted 1.5 s into its answer leaves its user prompt in the transcript and no assistant
  message. A plain resume afterwards answers with the aborted turn's word, CHERRY. A resume at turn
  1's last message answers APPLE.
- With `forkSession: true`, the resume writes to a new session ID, and the original keeps its 7
  messages. The caller records the new ID as the session to resume next.

```text
turn 1: session=8f9af55b-… lastUuid=7e483931-… answer="OK"
turn 2: session=8f9af55b-… lastUuid=f9e4f404-… answer="OK"
original after turn 2: 6 messages, types user,assistant,assistant,user,assistant,assistant
A resumeSessionAt+fork: session=7951cf36-… answer="APPLE"
fork B: 3 messages, types user,assistant,assistant
B forkSession+resume: session=801dc236-… answer="APPLE"
turn 3 aborted: stopped (Error: Claude Code process aborted by user)
original after aborted turn: 7 messages, types user,assistant,assistant,user,assistant,assistant,user
C resumeSessionAt after abort: session=d8c0cd85-… answer="APPLE"
original at end: 7 messages, types user,assistant,assistant,user,assistant,assistant,user
control plain resume: session=8f9af55b-… answer="CHERRY"
```

## Untested

- A process killed with `SIGKILL` in the middle of a tool call, rather than an SDK abort.
- A kept turn that ends in a tool call. The `resumeSessionAt` docs say the fork point must then be
  the turn's last chain entry, not its last assistant message.
- `resumeDropsTurn`, which validates that everything after the fork point belongs to the dropped
  turn and refuses the resume otherwise.
- A session that compacted between the fork point and the crash.
