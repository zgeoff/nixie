# The memory checker eval

This eval measures the [memory checker](../../docs/architecture/memory/writes.md#the-checker): how
often it confirms a memory you never asserted (a wrong confirmation), and how often it answers
anything else for one you did (a miss). Only an asserted verdict applies a write, so a miss sends a
true memory to review, and a wrong confirmation lets a false one in.

[corpus.json](corpus.json) holds 40 synthetic messages and 70 pairs: 31 memories the message asserts
and 39 it does not, such as negations, questions, quoted remarks, sarcasm and pasted facts. Every
pair passes the quote check and the token check, so the checker alone decides it. The labels were
written before any model saw a case. A pair marked `mustConfirm` is one an earlier prompt missed.

## Run it

The run calls the production checker with the production prompt, on the input the content gate
renders for each pair, 3 times each, through the check guest's query and your local Claude Code
login. It rewrites [report.json](report.json), which `bun test` then checks.

```bash
env -u ANTHROPIC_API_KEY bun evals/memory-checker/run-memory-checker-eval.ts
bun test evals
```

The suite fails when the report came from another prompt, when it skipped a pair or rendered a
pair's input differently from the gate, when any call confirmed a memory the message does not
assert, or when a `mustConfirm` pair drew anything but asserted.

## Results

Sonnet 5.5 at low effort, with the 10 s timeout, over 210 calls:

| Measure             | Result         |
| ------------------- | -------------- |
| Wrong confirmations | 0 of 117       |
| Misses              | 6 of 93 (6%)   |
| p95 latency         | 5.4 s          |
| Slowest call        | 8.3 s          |
| Timeouts            | 0              |
| Cost                | $0.66 in total |

- The conditional plan and the negation that the first prompt missed now pass on every call.
- 3 misses are "Biscuit is not diabetic" from "the vet said Biscuit isn't diabetic". The prompt
  rejects a memory that drops the message's attribution, and this pair drops it.
- 3 misses are "the owner's brother is allergic to penicillin" from "that was my brother", which the
  checker answers unsure because the message only implies it.

The first measurement, before the prompt took the evidence mark and the rule that a memory may keep
the message's own condition or attribution, ran Haiku 5.5, Sonnet 5.5 and Opus 5.5 over the same
pairs. None of the 585 calls confirmed a memory the message does not assert. Misses fell with model
size: Haiku missed 11 to 17% of calls, Sonnet 3 to 4% and Opus 1%. Marking the quote as `«quote»`
made Haiku and Sonnet read it as someone else's speech, and the `«evidence»` mark fixed it.
