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

The [memory checker eval runbook](../../docs/runbooks/memory-checker-eval.md) runs a set through the
production checker, rewrites its report and checks the reports with `bun test evals`.

## Results

Sonnet 5.5 at low effort, with the production checker's timeout and the reason asked before the
verdict, on the prompt with the rules for end times, and with the owner named Sam:

| Set         | Wrong confirmations | Misses  | Failed calls | Cost  |
| ----------- | ------------------- | ------- | ------------ | ----- |
| corpus      | 0 of 117            | 0 of 93 | 2 of 210     | $0.62 |
| held-out-1  | 0 of 42             | 0 of 36 | 0 of 78      | $0.22 |
| held-out-2  | 0 of 42             | 0 of 36 | 0 of 78      | $0.23 |
| held-out-3  | 0 of 42             | 0 of 30 | 0 of 72      | $0.22 |
| held-out-4  | 0 of 42             | 0 of 33 | 0 of 75      | $0.22 |
| held-out-5  | 0 of 39             | 0 of 36 | 0 of 75      | $0.22 |
| subjects    | 0 of 27             | 0 of 9  | 0 of 36      | $0.12 |
| time-limits | 0 of 15             | 0 of 18 | 0 of 33      | $0.15 |

A failed call times out or gives no readable answer, and it answers unsure, which sends the write to
review, as the 2 failed corpus calls did. The p95 latency ran from 6.5 s to 11.9 s across the sets.
The prompt was tuned on the corpus. Each held-out set was written and committed, with its labels,
before any run, and its pass rule was no wrong confirmation:

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
- [time-limits.json](time-limits.json) pairs an end time that the message's time limit gives with
  one it does not, such as the Friday of "this week", beside facts with no time limit or a vague
  one, and passed.

The first measurement, before the prompt took the evidence mark and the rule that a memory may keep
the message's own condition or attribution, ran Haiku 5.5, Sonnet 5.5 and Opus 5.5 over the same
pairs. None of the 585 calls confirmed a memory the message does not assert. Misses fell with model
size: Haiku missed 11 to 17% of calls, Sonnet 3 to 4% and Opus 1%. Marking the quote as `«quote»`
made Haiku and Sonnet read it as someone else's speech, and the `«evidence»` mark fixed it.
