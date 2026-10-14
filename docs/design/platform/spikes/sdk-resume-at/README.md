# Spike: resume a session at a given message

This spike checks whether an Agent SDK session can resume or fork from a given message, so that a
task's rerun after a crash drops the turn that never committed. A second script checks the same
resume after the SDK compacted the session past the step's boundary. The
[tasks design](../../core/tasks.md#crash-recovery) relies on both answers.

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
5. Does `resumeSessionAt` resume at a step's recorded boundary after the session compacted past it?

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
env -u ANTHROPIC_API_KEY bun --no-env-file resume-after-compact.ts "$(mktemp -d)"
```

Inside a sandbox whose broker adds the model credential, skip the vault read: the script then passes
a placeholder token and the sandbox's proxy variables. `resume-after-compact.ts` runs about 30 model
calls, about $0.15 in the SDK's estimate.

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

## After a compaction

`resume-after-compact.ts` answers question 5. Each scenario seeds a session with 2 turns of about
12,000 tokens each: turn 1 sets the code word APPLE and turn 2 changes it to BANANA. The seed then
records the last chain entry in the transcript as the step's boundary, as a step commit does. The
crashed step runs in its own process group under `setsid`, and the script kills the group with
`SIGKILL` once the model's answer starts to stream. A resume at the boundary should answer BANANA.

| Scenario | Between the boundary and the crash                                        | Crashed step |
| -------- | ------------------------------------------------------------------------- | ------------ |
| M        | a `/compact` call                                                         | CHERRY       |
| U        | a turn that sets CHERRY and never commits, then a `/compact` call         | DATE         |
| A        | nothing: auto-compaction fires inside the crashed step, before its prompt | CHERRY       |

Scenario A lowers the auto-compact threshold for the crashed step only, with
`CLAUDE_CODE_AUTO_COMPACT_WINDOW=100000` and `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=15`. In a probe
session of 44,000 tokens, a window of 20,000 to 50,000 tokens on its own never compacted, and
neither did the percentage override on the default window.

### What a compaction keeps

A compaction leaves every earlier entry in the transcript file and starts a new chain. Its
`compact_boundary` entry has no parent and points back to the old chain through `logicalParentUuid`.
The summary follows it, then a preserved segment: the old chain's entries after its last prompt,
re-parented under the summary and listed in the boundary's `compactMetadata.preservedMessages`. In
every run here, the preserved segment was the last turn's answer. A resume loads only the new chain.

### Answers

- The resume works only when the compaction preserved the boundary. In M and A, nothing came between
  the boundary and the compaction, so turn 2's answer was the preserved segment. A resume at the
  boundary with `forkSession: true` answered BANANA and read about 1,700 tokens of context: the
  SDK's summary plus turn 2's answer, never the 23,600 tokens of raw history. In M, a resume at the
  chain's last entry after the compaction answered BANANA as well.
- When anything came between the boundary and the compaction, the resume fails. In U, the
  uncommitted turn's answer became the preserved segment, and the boundary stayed only in the old
  chain. The resume ended with `error_during_execution` and
  `No message found with message.uuid of: <boundary>`, wrote no fork, and left the original intact,
  although the file still held the boundary's entry.
- No scenario leaked the dropped turn into a resume at the boundary. In each, the summary covered
  only committed turns, and in U, where the summary covered the uncommitted CHERRY, the resume
  refused.
- `resumeDropsTurn` refuses every resume across a compaction. In M, with the crashed prompt's UUID,
  the CLI answered `Resume rejected by --resume-drops-turn: … range does not start with …`, because
  the summary and the `/compact` entries sit in the discarded range.
- A plain resume answers from the crashed step's prompt: CHERRY in M and A, and DATE in U.

```text
M turn 2: session=5cfdbc72… context=23615 compactions=[] answer="OK"
M boundary: file entries=27 chain entries=14 compact_boundary=0 last=assistant
M compaction: session=5cfdbc72… context=0 compactions=[manual pre=23703] answer=""
M after compaction: file entries=40 chain entries=21 compact_boundary=1 holds boundary=true preserves boundary=true last=attachment
M turn 3 crashed: killed=SIGKILL events=[event text] left in group=0
M1 resumeSessionAt old boundary: session=0254cb38… context=1654 compactions=[] answer="BANANA"
M2 resumeSessionAt + resumeDropsTurn: session=18bd5843… context=0 compactions=[] answer="[result error_during_execution: Resume rejected by --resume-drops-turn: resuming at <uuid> would discard entries not attri…]"
M3 resumeSessionAt post-compaction boundary: session=82118e3c… context=1761 compactions=[] answer="BANANA"
M control plain resume: session=847229dc… context=1826 compactions=[] answer="CHERRY"
U turn 2: session=36622723… context=23535 compactions=[] answer="OK"
U boundary: file entries=27 chain entries=14 compact_boundary=0 last=assistant
U turn 3 uncommitted: session=36622723… context=23645 compactions=[] answer="OK"
U compaction: session=36622723… context=0 compactions=[manual pre=23689] answer=""
U after compaction: file entries=48 chain entries=25 compact_boundary=1 holds boundary=true preserves boundary=false last=attachment
U turn 4 crashed: killed=SIGKILL events=[event text] left in group=0
U1 resumeSessionAt old boundary: session=c9aac685… context=0 compactions=[] answer="[result error_during_execution: No message found with message.uuid of: <uuid>…]"
U control plain resume: session=2e7fc69c… context=1914 compactions=[] answer="DATE"
A turn 2: session=dc19d656… context=23598 compactions=[] answer="OK"
A boundary: file entries=27 chain entries=14 compact_boundary=0 last=assistant
A turn 3 crashed: killed=SIGKILL events=[event compact_boundary {"trigger":"auto","pre_tokens":23702,"post_tokens":1782,…} | event text] left in group=0
A after crash: file entries=41 chain entries=23 compact_boundary=1 holds boundary=true preserves boundary=true last=attachment
A1 resumeSessionAt old boundary: session=998357c7… context=1910 compactions=[] answer="BANANA"
A control plain resume: session=faccd6a4… context=1975 compactions=[] answer="CHERRY"
```

### Recommendation

A crashed step whose session compacted past its boundary rebuilds the session from the log. It does
not resume at the boundary:

- The resume fails outright whenever the compaction came after any uncommitted entry, which is the
  case for a compaction inside a turn's tool loop. The failure is deterministic, so a retry fails
  the same way.
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

## Untested

- A process killed with `SIGKILL` in the middle of a tool call, rather than an SDK abort.
- A kept turn that ends in a tool call. The `resumeSessionAt` docs say the fork point must then be
  the turn's last chain entry, not its last assistant message.
- `resumeDropsTurn`, which validates that everything after the fork point belongs to the dropped
  turn and refuses the resume otherwise.
- A compaction between model calls inside a crashed turn with tool calls. The CLI's preserved
  segment there may start at a tool result rather than a prompt.
- A preserved segment longer than one turn's answer, such as after a long tool loop.
- SDK versions other than 0.3.293; nixie pins 0.3.290.
