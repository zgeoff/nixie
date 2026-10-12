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
login. It rewrites [report.json](report.json), which `bun test` then checks.

```bash
env -u ANTHROPIC_API_KEY bun evals/memory-checker/run-memory-checker-eval.ts
bun test evals
```

The suite fails when the report came from another prompt, when it skipped a pair or rendered a
pair's input differently from the gate, when any call confirmed a memory the message does not
assert, when any answered call missed one it does assert, or when more than 1 call in 100 gave no
verdict of its own.

## Results

Sonnet 5.5 at low effort, with the 10 s timeout, over 210 calls:

| Measure             | Result         |
| ------------------- | -------------- |
| Wrong confirmations | 0 of 117       |
| Misses              | 0 of 93        |
| Timeouts            | 1 of 210       |
| p95 latency         | 3.7 s          |
| Cost                | $0.65 in total |

The one timeout fell on a pair the message does not assert, so its unsure verdict was right.

Earlier runs of this eval shaped the prompt. One missed a fact about the owner's brother stated as a
correction, and a vet's finding the owner welcomed, so the prompt gained the rules that a fact about
another person counts and that a memory may drop an attribution the owner accepts as settled. A
later run missed a one-off event the checker judged not worth keeping, so the prompt now tells it to
judge the assertion alone. Its examples are written for the prompt and share no topic with a corpus
case.

The first measurement, before the prompt took the evidence mark and the rule that a memory may keep
the message's own condition or attribution, ran Haiku 5.5, Sonnet 5.5 and Opus 5.5 over the same
pairs. None of the 585 calls confirmed a memory the message does not assert. Misses fell with model
size: Haiku missed 11 to 17% of calls, Sonnet 3 to 4% and Opus 1%. Marking the quote as `«quote»`
made Haiku and Sonnet read it as someone else's speech, and the `«evidence»` mark fixed it.
