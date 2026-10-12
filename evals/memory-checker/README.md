# The memory checker eval

This eval measures the [memory checker](../../docs/architecture/memory/writes.md#the-checker): how
often it confirms a memory you never asserted (a wrong confirmation), and how often it answers
anything else for one you did (a miss). Only an asserted verdict applies a write, so a miss sends a
true memory to review, and a wrong confirmation lets a false one in.

[corpus.json](corpus.json) holds 40 synthetic messages and 70 pairs: 31 memories the message asserts
and 39 it does not, such as negations, questions, quoted remarks, sarcasm and pasted facts. Every
pair passes the quote check and the token check, so the checker alone decides it. The labels were
written before any model saw a case.

## Run it

The run calls the production checker with the production prompt, on the input the content gate
renders for each pair, 3 times each, through the check guest's query and your local Claude Code
login. It takes a set's name and rewrites that set's report, such as
[corpus-report.json](corpus-report.json), which `bun test` then checks.

```bash
env -u ANTHROPIC_API_KEY bun evals/memory-checker/run-memory-checker-eval.ts held-out-3
bun test evals
```

The suite fails when a report came from another prompt, skipped a pair or rendered a pair's input
differently from the gate. It fails when a call confirms a memory that any set's message does not
assert, and when an answered call misses one that a tuning set's message asserts.

## Results

Sonnet 5.5 at low effort, with the 10 s timeout and the reason asked before the verdict:

| Set        | Wrong confirmations | Misses  | Failed calls | Cost  |
| ---------- | ------------------- | ------- | ------------ | ----- |
| corpus     | 0 of 117            | 0 of 93 | 1 of 210     | $0.63 |
| held-out-1 | 0 of 42             | 0 of 36 | 0 of 78      | $0.23 |
| held-out-2 | 0 of 42             | 0 of 36 | 1 of 78      | $0.26 |
| held-out-3 | 0 of 42             | 0 of 30 | 0 of 72      | $0.23 |

Both failed calls timed out on a memory the message asserts, so each sent a true memory to review.
The p95 latency ran from 3.1 s to 8.4 s across the sets. The prompt was tuned on the corpus. Each
held-out set was written and committed, with its labels, before any run, and its pass rule was no
wrong confirmation:

- [held-out-1.json](held-out-1.json) failed on agreed advice and on a fact a question presupposes,
  so the prompt gained a rule for each, and the set became a tuning set.
- [held-out-2.json](held-out-2.json) failed on facts that a question presupposes. In one call the
  reason said the memory was not asserted and the verdict said it was, so the answer schema puts the
  reason first. The checker kept confirming "The owner sold their bike" from "Did I ever tell you
  why I sold my bike?", so the presupposition rule gained an example in the owner's own voice, and
  the set became a tuning set.
- [held-out-3.json](held-out-3.json) scored the reason-first schema before and after that example,
  and passed both times.

The first measurement, before the prompt took the evidence mark and the rule that a memory may keep
the message's own condition or attribution, ran Haiku 5.5, Sonnet 5.5 and Opus 5.5 over the same
pairs. None of the 585 calls confirmed a memory the message does not assert. Misses fell with model
size: Haiku missed 11 to 17% of calls, Sonnet 3 to 4% and Opus 1%. Marking the quote as `«quote»`
made Haiku and Sonnet read it as someone else's speech, and the `«evidence»` mark fixed it.
