# Spike: session recovery

This spike compares two ways to recover a conversation session: an SDK resume of the task's
transcript, and a rebuild that starts a new session from the event log. It runs both after a
compaction and after a crash, and checks the two rules that
[the SDK transcript](../../memory/context.md#the-sdk-transcript) design sets for recovery:
proposals, approvals and action outcomes come from canonical rows, and a forget removes every
invalid transcript copy after its writer stops. [Crash recovery](../../core/tasks.md#crash-recovery)
sets the resume at the step boundary, and the [resume-at spike](../sdk-resume-at/README.md) is its
evidence.

- Claude Code 2.1.296, driven as `claude -p`, which takes the flags the SDK passes it: `--resume`,
  `--resume-session-at` and `--fork-session`
- Model: `claude-haiku-4-5-20251001`
- Flags on every call: `--tools ""`, `--setting-sources ""`, a nixie-style `--system-prompt`, and an
  environment that passes only `PATH`, `HOME`, `CLAUDE_CONFIG_DIR` inside the task's own directory,
  the OAuth token, and the flags that turn off nonessential traffic, auto memory and updates
- 5 runs per variant, in 2 full runs of `run.ts` and 1 of `compact.ts`, for about $2.20 in total

## Questions

1. After a compaction, which recovers more of the conversation: a resume of the compacted session,
   or a rebuild from the log?
2. After a crash, which recovers better: a plain resume, a resume at the step boundary, or a
   rebuild?
3. Do pending approvals and action outcomes come from canonical rows, even when a summary or the
   transcript holds a different state?
4. Does a forget remove every invalid transcript copy once its writer stops, and what happens when
   the removal does not wait for the writer?

## Run it

Run the commands from this directory. Each script needs an empty directory, writes only there and
under the system temporary directory, and prints one line per check.

```bash
bun install
# The model token, from the vault. Run `unset CLAUDE_CODE_OAUTH_TOKEN` when you finish.
export CLAUDE_CODE_OAUTH_TOKEN=$(
  OP_SERVICE_ACCOUNT_TOKEN=$(jq -r .env.OP_SERVICE_ACCOUNT_TOKEN ../../../../../.claude/settings.local.json) \
    op --cache=false read 'op://nixie/claude-code-oauth-token/credential'
)
env -u ANTHROPIC_API_KEY bun --no-env-file run.ts "$(mktemp -d)" 5
env -u ANTHROPIC_API_KEY bun --no-env-file compact.ts "$(mktemp -d)" 3
# The scan's own tests, with no model calls
bun test
```

- [cli.ts](cli.ts) runs one `claude -p` call for a task and reads its transcript.
- [log.ts](log.ts) holds a stand-in event log in SQLite: the turns, the compaction summaries, the
  proposal and action rows, and the session records. It renders the canonical state block and the
  rebuild's first turn.
- [run.ts](run.ts) runs the comparison and the canonical-state and forget checks.
- [collect-files-with.ts](collect-files-with.ts) finds every file that holds the forgotten text. The
  scan outside the task's directory skips that directory, which sits under `/tmp` when the run
  directory comes from `mktemp -d`.
- [compact.ts](compact.ts) checks what decides the content of a compaction summary, and runs one
  automatic compaction.

## Method

The conversation is 5 synthetic turns about planning a trip. Each turn resumes the previous one at
its last chain entry with a fork, as the conversation guest does. The turns hold a booking reference
in turn 1 and a key-box code in turn 4. They also hold `[nixie]` lines for proposal P-1 (pending),
action A-1 (started, then succeeded) and proposal P-2 (pending). The log takes each turn and the
rows each step commits.

Each recovery then answers one probe with a JSON object: the booking reference, the key-box code,
and the state of each proposal and action. The run scores each field against the rows, and counts as
unsafe any answer that claims an approval or a success that no row records.

- **After a compaction**, a `/compact` step forks from the boundary, and the log takes its summary.
  A nixie step then lapses P-2 with no model turn, so no transcript holds the lapse. Each of the 5
  runs compacts afresh, so the results cover the spread of the model-written summary.
- **After a crash**, a sixth turn changes the key-box code and starts action A-3, and the run kills
  the CLI with `SIGKILL` 1.5 s after the turn's prompt reaches the transcript. Recovery marks the
  step interrupted, A-3 unknown, and P-2 lapsed by a timer that fell due in the downtime. The
  rerun's input is the unread inbox: the interrupted message again, and the probe.

A variant with "+ state" puts the canonical state block before the inbox. A rebuild's first turn
carries the brief, the latest summary, the recent turns word for word, the state block and the
inbox. The default recent-turn budget of 30,000 tokens holds this whole conversation. A tight budget
of 120 tokens leaves only the last turn, standing in for a conversation longer than the budget.

## Answers

### After a compaction

| Variant                         | Run 1 | Run 2 | Fields it missed              |
| ------------------------------- | ----- | ----- | ----------------------------- |
| Resume of the compacted session | 10/25 | 8/25  | reference, code, ferry, table |
| Resume + state                  | 15/25 | 17/25 | reference, code               |
| Rebuild, default budget         | 25/25 | 25/25 | none                          |
| Rebuild, tight budget           | 15/25 | 17/25 | reference, code               |

The summary decides what a compacted session recalls, and the state block decides what it knows
about proposals and actions. After compaction the SDK session holds the summary and no turn from
before it word for word: the only chain entries after the summary are the command's own 3 lines. A
resume of it and a rebuild with the tight budget read the same summary, and they score the same. The
rebuild with the default budget scores 25/25 because its window held the whole conversation. That
number does not carry over to a long conversation. The mechanism does: a rebuild adds up to 30,000
tokens of recent turns word for word to the same summary.

Without the state block, the resume answered that P-2 was still pending in 10 of 10 runs, because
the lapse never reached the transcript. It also answered "unknown" for the pending ferry in 4 of 5
runs of the second full run. With the state block, no run missed a proposal or an action.

### After a crash

| Variant                           | Run 1 | Run 2 | Fields it missed |
| --------------------------------- | ----- | ----- | ---------------- |
| Plain resume of the crashed fork  | 15/25 | 15/25 | table, checkout  |
| Resume at the boundary            | 15/25 | 15/25 | table, checkout  |
| Resume at the boundary + state    | 20/25 | 20/25 | checkout         |
| Rebuild, default budget           | 21/25 | 21/25 | checkout         |
| Rebuild, tight budget, no summary | 18/25 | 19/25 | reference        |

A resume at the boundary with the state block and a rebuild recover a crash equally well. The resume
keeps every earlier turn word for word with no budget, while a rebuild of a conversation longer than
its budget loses what no summary holds: the tight rebuild lost the booking reference in 10 of 10
runs, because no compaction had run.

- The `SIGKILL` left the interrupted prompt in the transcript and no assistant entry, in each of 3
  runs.
- A plain resume of the crashed fork gave the model the interrupted message twice in 10 of 10 runs.
  It scored the same here only because the rerun repeats that message word for word.
- Every miss on the late-checkout action, 41 across the 2 runs, answered "in progress" for an action
  the row holds as unknown. None answered "done". The model reads the row text "unknown, the attempt
  started and no result was recorded" as still running.

### Canonical state

The state block reads only the proposal and action rows. The run appends a contradicting update to
the stored summary, which claims the ferry is booked, the table reserved and the email failed. The
state block stays byte for byte the same, in 10 of 10 runs, and the rebuild's first turn holds both
texts. Given that first turn, the model answered every proposal and action from the rows in 10 of 10
runs; its only misses were the reference and code that the summary had lost.

No answer claimed an approval or a success that no row records: 0 unsafe claims in the 100 scored
answers of the 2 full runs.

### Compaction summaries

Under the nixie-style system prompt, most `/compact` summaries were a short assistant reply rather
than a summary. In 9 of 10 runs of `run.ts` the summary held neither the booking reference nor the
key-box code. `compact.ts` compacts a 3-turn version of the conversation 3 times per case:

| Case                                     | Reference | Code | P-1 |
| ---------------------------------------- | --------- | ---- | --- |
| nixie prompt, `/compact`                 | 0/3       | 3/3  | 1/3 |
| nixie prompt, `/compact` with directions | 3/3       | 3/3  | 3/3 |
| neutral prompt, `/compact`               | 2/3       | 3/3  | 2/3 |

The directions read "keep every reference number, code, name, and proposal or action ID with its
last known state". One automatic compaction, set by `CLAUDE_CODE_AUTO_COMPACT_WINDOW` at 100,000
tokens after a 104,000-token turn, wrote the same `compact_boundary` and summary entries as
`/compact`, and its summary held all 3 facts. That is 1 run.

The SDK's types give the `PreCompact` hook the manual directions as input, and no output that sets
directions for an automatic compaction. The summary message also wraps the summary in directions to
the model and the transcript's absolute path. The run keeps only the summary body in the log, and
the `session_compacted` record needs the same cut.

### Forget

The forget check runs with `TMPDIR` at the system default, to show where the CLI writes outside the
task's directory.

- After 2 turns and a compaction, 3 files held the forgotten text: the first session, its fork, and
  the compacted fork. All 3 sit in the task's `projects` folder. A compaction keeps the text before
  its boundary in the file, and a fork copies it.
- Nothing outside the task's directory held the text: the scan covers `/tmp` and `/dev/shm`.
- Removing the directory while a writer still ran left a new transcript with the text in 2 of 3
  runs, written by the writer after the removal.
- The design's order left no copy in 3 of 3 runs. The run commits `session_invalidated`, which
  refuses a new query, then sends the writer `SIGTERM` and waits for its exit, which took 22 ms to
  29 ms. It then removes the directory, checks it is gone, commits `session_cleanup_completed`, and
  scans again 3 s later.

### Cost

The cost per call is not comparable between variants. The `usage` field covers only the turn's main
request, and on some calls the CLI makes more model calls of its own. One probe of a plain resume
and a resume at the boundary found 1,951 input tokens in `usage` and 7,893 in `modelUsage` for both,
at $0.012 each.

## Recommendation

- **After a crash, resume at the boundary with a fork**, as the tasks design sets, and put the
  canonical state block in the rerun's input. Without the block, the rerun answered the lapsed
  proposal wrong in 10 of 10 runs. Never resume the crashed fork, which repeats the interrupted
  message.
- **After a compaction, rebuild at the next step** from the log, and stop resuming the compacted
  session. Both read the same summary, and the rebuild adds the recent turns word for word and the
  state block. This changes the [compaction](../../memory/context.md#compaction) design, which keeps
  the SDK's compacted session, so the owner decides it in the Memory 1 build. Without that change,
  the first turn after each compaction carries the state block.
- **Every rerun and rebuild carries the state block**, written from the rows alone. Its text for an
  unknown outcome needs a wording the model does not read as "in progress".
- **Compaction keeps identifiers.** The nixie system prompt cost the summary its facts in most runs,
  and directions restored them in 3 of 3. Memory 1 needs a route to give automatic compaction those
  directions.
- **A forget removes the whole task directory**, never single files, and only after the writer has
  exited. The SDK leaves forgotten text in every fork and in the part of a file before a compaction
  boundary.

## Untested

- A long conversation, where the recent-turn window and the SDK's own automatic compaction both hold
  more than this 2,000-token conversation does.
- A crash inside a tool call, or during an automatic compaction.
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW` at nixie's 200,000-token default; the run used 100,000 tokens.
- A writer that ignores `SIGTERM`, which the design meets by replacing the imp.
- Other models than Haiku 4.5, whose summaries and readings of the state block may differ.

## Output

The second full run of `run.ts`, with paths cut:

```text
| compaction / resume | 8/25 | booking_ref, keybox_code, ferry, pub_table | 0 | 1429 | 0.0214 | 5624 |
| compaction / resume + state | 17/25 | booking_ref, keybox_code | 0 | 1525 | 0.0208 | 4129 |
| compaction / rebuild, default budget | 25/25 | - | 0 | 1322 | 0.0030 | 3536 |
| compaction / rebuild, tight budget | 17/25 | booking_ref, keybox_code | 0 | 1158 | 0.0033 | 4248 |
| canonical / rebuild with a contradicting summary | 17/25 | booking_ref, keybox_code | 0 | 1192 | 0.0067 | 10290 |
| crash / plain resume of the crashed session | 15/25 | pub_table, late_checkout_cancel | 0 | 2263 | 0.0043 | 4665 |
| crash / resume at the boundary | 15/25 | pub_table, late_checkout_cancel | 0 | 2135 | 0.0139 | 4662 |
| crash / resume at the boundary + state | 20/25 | late_checkout_cancel | 0 | 2257 | 0.0142 | 4573 |
| crash / rebuild, default budget | 21/25 | late_checkout_cancel | 0 | 1410 | 0.0050 | 6121 |
| crash / rebuild, tight budget, no summary | 19/25 | booking_ref, late_checkout_cancel | 0 | 1107 | 0.0073 | 11049 |
forget
  copies after 2 turns and a compaction: <task>, <task>, <task>
  copies outside the task directory: none
  removed the directory under a live writer: gone=true
  after the writer exited: none
  invalidated: a new query is refused=true
  writer exited on SIGTERM=true in 29ms
  removed: gone=true, copies 3 s later: none
  copies outside the task directory: none
  cleanup completed: a new query is refused=false
```

The columns are the variant, the fields right out of the fields asked over 5 runs, the fields
missed, the count of unsafe claims, and the means of the main request's input tokens, the cost in
USD and the time in ms.
