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
[corpus-report.json](corpus-report.json), which `bun test` then checks. An invented owner name after
the set's name renders the prompt with that name and swaps it into each memory for "the owner", as a
deployment with that name would see them.

```bash
env -u ANTHROPIC_API_KEY bun evals/memory-checker/run-memory-checker-eval.ts held-out-3 Sam
bun test evals
```

The suite fails when a report came from another prompt, skipped a pair or rendered a pair's input
differently from the gate. It fails when a call confirms a memory that any set's message does not
assert, and when an answered call misses one that a tuning set's message asserts.

On a cloud imp, run the eval this same way, through the imp's Claude Code login. The imp's broker
forwards a subscription token, which the Messages API takes for Haiku but refuses for Sonnet with a
429 `rate_limit_error` when the request does not come from Claude Code. A runner that calls the API
directly from an imp works only with Haiku.

## Results

Sonnet 5.5 at low effort, with the 10 s timeout and the reason asked before the verdict, on the
prompt with the rules for whom a memory is about, and with the owner named Sam:

| Set        | Wrong confirmations | Misses  | Failed calls | Cost  |
| ---------- | ------------------- | ------- | ------------ | ----- |
| corpus     | 0 of 117            | 0 of 93 | 0 of 210     | $0.54 |
| held-out-1 | 0 of 42             | 0 of 36 | 0 of 78      | $0.19 |
| held-out-2 | 0 of 42             | 0 of 36 | 0 of 78      | $0.19 |
| held-out-3 | 0 of 42             | 0 of 30 | 0 of 72      | $0.17 |
| held-out-4 | 0 of 42             | 0 of 33 | 0 of 75      | $0.19 |
| held-out-5 | 0 of 39             | 0 of 36 | 0 of 75      | $0.19 |
| subjects   | 0 of 27             | 0 of 9  | 0 of 36      | $0.12 |

The first run of held-out-3 on this prompt confirmed "The owner's daughter has a tutor" from "When
does my daughter's tutor start charging the new rate?" in 1 of 3 calls, and timed out on another,
and a second run passed; the committed report is the second run. The prompt before those rules
passed every set both with memories about "the owner" and with the owner named Sam.

A failed call times out or gives no readable answer, and it answers unsure, which sends the write to
review. The p95 latency ran from 3.6 s to 7.8 s across the sets. The prompt was tuned on the corpus.
Each held-out set was written and committed, with its labels, before any run, and its pass rule was
no wrong confirmation:

- [held-out-1.json](held-out-1.json) failed on agreed advice and on a fact a question presupposes,
  so the prompt gained a rule for each, and the set became a tuning set.
- [held-out-2.json](held-out-2.json) failed on facts that a question presupposes. In one call the
  reason said the memory was not asserted and the verdict said it was, so the answer schema puts the
  reason first. The checker kept confirming "The owner sold their bike" from "Did I ever tell you
  why I sold my bike?", so the presupposition rule gained an example in the owner's own voice, and
  the set became a tuning set.
- [held-out-3.json](held-out-3.json) scored the reason-first schema before and after that example,
  and passed both times.
- [held-out-4.json](held-out-4.json) scored the final prompt, which no change followed, and passed.
- [held-out-5.json](held-out-5.json) holds memories that keep the owner's distinctive words, beside
  jokes and similes stated as facts, and passed with and without the owner's name.
- [subjects.json](subjects.json) holds memories about the owner built from what the message says
  about the assistant, such as "you clearly love thunderstorms", beside deals and names the owner
  shares with the assistant, and passed.

The first measurement, before the prompt took the evidence mark and the rule that a memory may keep
the message's own condition or attribution, ran Haiku 5.5, Sonnet 5.5 and Opus 5.5 over the same
pairs. None of the 585 calls confirmed a memory the message does not assert. Misses fell with model
size: Haiku missed 11 to 17% of calls, Sonnet 3 to 4% and Opus 1%. Marking the quote as `«quote»`
made Haiku and Sonnet read it as someone else's speech, and the `«evidence»` mark fixed it.
