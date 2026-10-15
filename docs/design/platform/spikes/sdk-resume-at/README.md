# Spike: resume a session at a given message

This spike checks whether an Agent SDK session can resume or fork from a given message, so that a
task's rerun after a crash drops the turn that never committed. A second script checks the same
resume after the SDK compacted the session past the step's boundary, including a compaction between
two model calls of a step that calls a tool. The [tasks design](../../core/tasks.md#crash-recovery)
relies on these answers.

- SDK: `@anthropic-ai/claude-agent-sdk` 0.3.290, the version nixie pins. The first runs used
  0.3.293, and every answer and error message below matched on both versions.
- Model: `claude-haiku-4-5-20251001`
- Options on every run: `tools: []`, `settingSources: []`, `maxTurns: 1`, a `CLAUDE_CONFIG_DIR` of
  its own, and an `env` that passes only `PATH`, `HOME`, the OAuth token and
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. One exception: scenario T's crashed step allows the
  `Read` tool and up to 4 model calls.

## Questions

1. Does the SDK offer a resume or fork from a given message, and under which names?
2. Does a resume at turn 1's last message drop a later turn, in what the model reads?
3. Does the same hold after a turn that was aborted mid-answer?
4. Does the original session stay intact?
5. Does `resumeSessionAt` resume at a step's recorded boundary after the session compacted past it?
6. Does the answer to question 5 hold when the compaction falls between model calls inside a crashed
   step that calls a tool?
7. Do the answers hold on 0.3.290, the SDK version nixie pins?

## Run it

Run the commands from this directory. `resume-at.ts` runs 7 model calls and prints one line per
turn.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file resume-at.ts "$(mktemp -d)"
env -u ANTHROPIC_API_KEY bun --no-env-file resume-after-compact.ts "$(mktemp -d)"
```

Inside a sandbox whose broker adds the model credential, skip the vault read. Both scripts then pass
a placeholder token and the sandbox's proxy variables. `resume-after-compact.ts` runs about 40 model
calls, about $1.20 in the SDK's estimate. A second argument picks the scenarios to run, such as `T`.

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
turn 1: session=0870c79c-… lastUuid=7e99295d-… answer="OK"
turn 2: session=0870c79c-… lastUuid=9472f9ed-… answer="OK"
original after turn 2: 6 messages, types user,assistant,assistant,user,assistant,assistant
A resumeSessionAt+fork: session=c0c56c2b-… lastUuid=5322fb6b-… answer="APPLE"
fork B: 3 messages, types user,assistant,assistant
B forkSession+resume: session=2bc98fd9-… lastUuid=5bb8c431-… answer="APPLE"
turn 3 aborted: stopped (Error: Claude Code process aborted by user)
turn 3 aborted: session=0870c79c-… lastUuid=9daf52ff-… answer=""
original after aborted turn: 7 messages, types user,assistant,assistant,user,assistant,assistant,user
C resumeSessionAt after abort: session=097adfa3-… lastUuid=546f5f38-… answer="APPLE"
original at end: 7 messages, types user,assistant,assistant,user,assistant,assistant,user
control plain resume: session=0870c79c-… lastUuid=79515f23-… answer="CHERRY"
```

## After a compaction

`resume-after-compact.ts` answers questions 5 and 6. Each scenario seeds a session with 2 turns of
about 12,000 tokens each: turn 1 sets the code word APPLE and turn 2 changes it to BANANA. The seed
then records the last chain entry in the transcript as the step's boundary, as a step commit does.
The crashed step runs in its own process group under `setsid`, and the script kills the group with
`SIGKILL` once the model's answer starts to stream after the step's compaction. A resume at the
boundary should answer BANANA.

| Scenario | Between the boundary and the crash                                          | Crashed step |
| -------- | --------------------------------------------------------------------------- | ------------ |
| M        | a `/compact` call                                                           | CHERRY       |
| U        | a turn that sets CHERRY and never commits, then a `/compact` call           | DATE         |
| A        | nothing: auto-compaction fires inside the crashed step, before its prompt   | CHERRY       |
| T        | nothing: auto-compaction fires inside the crashed step, after a tool result | CHERRY       |

Scenario A lowers the auto-compact threshold for the crashed step only, with
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000` and `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=15`. In a probe
session of 44,000 tokens, a window of 20,000 to 50,000 tokens on its own never compacted, and
neither did the percentage override on the default window.

In scenario T, the crashed step's prompt asks the model to read a file of about 20,000 tokens of
stock notes, whose last line sets CHERRY, and then to write a story with the new code word. The step
sets the percentage override to 40, so the seed's 24,000 tokens stay under the threshold and the
seed plus the file go over it. The compaction then fires after the tool result, before the step's
second model call.

### What a compaction keeps

A compaction leaves every earlier entry in the transcript file and starts a new chain. Its
`compact_boundary` entry has no parent and points back to the old chain through `logicalParentUuid`.
The summary follows it, then a preserved segment: a tail of the old chain, re-parented under the
summary and listed in the boundary's `compactMetadata.preservedMessages`. A resume loads only the
new chain. The preserved segment held:

- in M and U, the last turn's answer;
- in A, turn 2's answer and the crashed step's prompt;
- in T, the crashed step's first model call, which made the tool call, and the tool result.

### Answers

- The resume works only when the compaction preserved the boundary. In M and A, nothing came between
  the boundary and the compaction, so turn 2's answer was in the preserved segment. A resume at the
  boundary with `forkSession: true` answered BANANA and read about 1,400 to 1,500 tokens of context:
  the SDK's summary plus turn 2's answer, never the 23,600 tokens of raw history. In M, a resume at
  the chain's last entry after the compaction answered BANANA as well.
- When anything came between the boundary and the compaction, the resume fails. In U, the
  uncommitted turn's answer became the preserved segment, and the boundary stayed only in the old
  chain. The resume ended with `error_during_execution` and
  `No message found with message.uuid of: <boundary>`, wrote no fork, and left the original intact,
  although the file still held the boundary's entry.
- A compaction between model calls of a crashed step fails the same way as U. In T, the step's own
  model call and tool result became the preserved segment, so the boundary stayed only in the old
  chain, and the resume ended with the same `No message found` error. With `resumeDropsTurn` set to
  the crashed prompt's UUID, the CLI gave the same error, so it looks up the boundary before it
  checks the dropped range.
- No scenario leaked the dropped turn into a resume at the boundary. In each, the summary covered
  only committed turns, and in U and T, where the summary covered the uncommitted CHERRY, the resume
  refused.
- `resumeDropsTurn` refuses every resume across a compaction. In M, with the crashed prompt's UUID,
  the CLI answered `Resume rejected by --resume-drops-turn: … range does not start with …`, because
  the summary and the `/compact` entries sit in the discarded range.
- A plain resume answers from the crashed step's prompt: CHERRY in M, A and T, and DATE in U. In T
  it read about 22,800 tokens, because the tool result survived the compaction whole.
- SDK 0.3.290 gave every answer that 0.3.293 gave, with the same error messages.

```text
M turn 2: session=ede1eb84 context=23582 cost=$0.0265 compactions=[] answer="OK"
M boundary: file entries=27 chain entries=14 compact_boundary=0 holds boundary=- preserves boundary=- preserved=[] last=assistant
M compaction: session=ede1eb84 context=0 cost=$0.0501 compactions=[manual pre=23632] answer=""
M after compaction: file entries=40 chain entries=21 compact_boundary=1 holds boundary=true preserves boundary=true preserved=[assistant,assistant] last=attachment
M turn 3 crashed: killed=SIGKILL events=[event text] left in group=0
M1 resumeSessionAt old boundary: session=eb6f46d9 context=1514 cost=$0.0523 compactions=[] answer="BANANA"
M2 resumeSessionAt + resumeDropsTurn: session=2b1b6456 context=0 cost=$0.0000 compactions=[] answer="[result error_during_execution: Resume rejected by --resume-drops-turn: resuming at <uuid> would discard entries not attributable to turn <uuid>: range does not start with ]…"
M3 resumeSessionAt post-compaction boundary: session=055654dc context=1621 cost=$0.0524 compactions=[] answer="BANANA"
M control plain resume: session=26a3dcbd context=1686 cost=$0.0525 compactions=[] answer="CHERRY"
U turn 2: session=d57ab94a context=23621 cost=$0.0269 compactions=[] answer="OK"
U boundary: file entries=27 chain entries=14 compact_boundary=0 holds boundary=- preserves boundary=- preserved=[] last=assistant
U turn 3 uncommitted: session=d57ab94a context=23758 cost=$0.0298 compactions=[] answer="OK"
U compaction: session=d57ab94a context=0 cost=$0.0429 compactions=[manual pre=23806] answer=""
U after compaction: file entries=48 chain entries=25 compact_boundary=1 holds boundary=true preserves boundary=false preserved=[assistant,assistant] last=attachment
U turn 4 crashed: killed=SIGKILL events=[event text] left in group=0
U1 resumeSessionAt old boundary: session=cc2b91d1 context=0 cost=$0.0000 compactions=[] answer="[result error_during_execution: No message found with message.uuid of: <uuid>]…"
U control plain resume: session=000a9407 context=1785 cost=$0.0452 compactions=[] answer="DATE"
A turn 2: session=d5944805 context=23599 cost=$0.0267 compactions=[] answer="OK"
A boundary: file entries=27 chain entries=14 compact_boundary=0 holds boundary=- preserves boundary=- preserved=[] last=assistant
A turn 3 crashed: killed=SIGKILL events=[event compact_boundary {"trigger":"auto","pre_tokens":23719,"post_tokens":1241,…} | event text] left in group=0
A after crash: file entries=41 chain entries=23 compact_boundary=1 holds boundary=true preserves boundary=true preserved=[assistant,assistant,prompt,attachment] last=attachment
A1 resumeSessionAt old boundary: session=23b8e4ba context=1372 cost=$0.0285 compactions=[] answer="BANANA"
A control plain resume: session=c9983f4d context=1437 cost=$0.0286 compactions=[] answer="CHERRY"
T turn 2: session=6fb0f999 context=23562 cost=$0.0265 compactions=[] answer="OK"
T boundary: file entries=27 chain entries=14 compact_boundary=0 holds boundary=- preserves boundary=- preserved=[] last=assistant
T turn 3 crashed: killed=SIGKILL events=[event tool_use Read | event tool_result | event compact_boundary {"trigger":"auto","pre_tokens":37437,"post_tokens":13432,…} | event text] left in group=0
T after crash: file entries=49 chain entries=28 compact_boundary=1 holds boundary=true preserves boundary=false preserved=[assistant,assistant,tool_result,attachment] last=attachment
T1 resumeSessionAt old boundary: session=b159ea95 context=0 cost=$0.0000 compactions=[] answer="[result error_during_execution: No message found with message.uuid of: <uuid>]…"
T2 resumeSessionAt + resumeDropsTurn: session=c3ac9b2a context=0 cost=$0.0000 compactions=[] answer="[result error_during_execution: No message found with message.uuid of: <uuid>]…"
T control plain resume: session=4d5f501d context=22834 cost=$0.0726 compactions=[] answer="CHERRY"
```

### Recommendation

A crashed step whose session compacted past its boundary rebuilds the session from the log. It does
not resume at the boundary:

- The resume fails outright whenever the compaction came after any uncommitted entry, which is the
  case for a compaction inside a turn's tool loop, as scenario T shows. The failure is
  deterministic, so a retry fails the same way.
- Where the resume works, the model continues from a summary that the SDK wrote and that nixie never
  committed to the event log, which the [compaction design](../../memory/context.md#compaction)
  rules out.

nixie's design keeps the case rare: the `PreCompact` hook blocks the SDK's auto-compaction, and
nixie's compactor opens a new session and clears the boundary. The rerun therefore needs one guard,
not a new path. When `query()` with `resumeSessionAt` ends in `error_during_execution` with a
message that starts `No message found with message.uuid of:`, or with
`Resume rejected by --resume-drops-turn:`, the rerun falls back to the rebuild that a lost or
invalid transcript takes. A rerun that finds a `compact_boundary` in the session's transcript after
its boundary takes the same rebuild before it calls `query()`, so the preserved case never resumes
on the SDK's summary.

Scenario T and the 0.3.290 runs leave this recommendation as it stands. The guard catches scenario T
twice: its transcript holds a `compact_boundary` after the boundary, and its resume ends with the
`No message found` message. The guard needs no SDK version condition, because 0.3.290 and 0.3.293
give the same results and the same error messages.

## Untested

- A process killed with `SIGKILL` in the middle of a tool call, rather than during the model's text.
- A kept turn that ends in a tool call. The `resumeSessionAt` docs say the fork point must then be
  the turn's last chain entry, not its last assistant message.
- `resumeDropsTurn`, which validates that everything after the fork point belongs to the dropped
  turn and refuses the resume otherwise.
- A preserved segment after a tool loop of several model calls.
- SDK versions other than 0.3.290 and 0.3.293.
