# Spike: the memory checker

This spike measures the checker model from the
[memory writes design](../../memory/writes.md#the-checker): how often it confirms a memory that you
never asserted, and how often it misses one that you did. It runs 3 Claude models over messages
written for the spike, each paired with memories it does and does not assert. Every pair passes the
quote check and the token check from the [memory checks spike](../memory-checks/README.md), so the
checker alone decides it.

- Bun 1.4.2 and a logged-in Claude Code 2.1.296 on the path, no other dependencies
- Models: `claude-haiku-5-5`, `claude-sonnet-5-5` and `claude-opus-5-5`

## Question

How often does the checker answer "asserted" for a memory you did not assert (a wrong confirmation),
and how often does it answer anything else for one you did (a miss)? Negations, questions and quoted
remarks pass the code checks, so they matter most.

## Run it

Run each command from this directory. A run calls `claude -p` once per pair and repeat, appends one
JSON line per call, and skips the calls its output file holds. Each line records the model, the mark
and a hash of the system prompt, and a run refuses an output file that another configuration wrote.

```bash
bun install
bun test
env -u ANTHROPIC_API_KEY bun --no-env-file run.ts --model claude-haiku-5-5 --out results/<run_name>.jsonl
bun report.ts results/*.jsonl
```

- [cases.ts](cases.ts) holds 40 messages and 70 pairs: 31 the message asserts and 39 it does not.
  Each pair names its bucket, such as a negation or a quoted remark. The labels were written before
  any model saw a case.
- [prompt.txt](prompt.txt) is the checker's system prompt. The input is the message, with the quote
  and each pasted span marked, and the candidate memory. The answer is a JSON verdict of `asserted`,
  `not_asserted` or `unsure` with a reason.
- [run.ts](run.ts) runs the calls with no tools, no settings and no session, and counts an error or
  an unreadable answer as unsure. `--marker` renames the mark around the quote.
- [results/](results/) holds the 5 recorded runs: each model with the quote marked `«quote»`, and
  Haiku and Sonnet again with it marked `«evidence»`. Each ran every pair 3 times.

## Answer

A wrong confirmation is an `asserted` answer on a pair the message does not assert. A miss is any
other answer on a pair it does assert, because only `asserted` applies a write; an unsure answer
counts as a miss. Each rate counts calls, over 117 calls on 39 pairs and 93 calls on 31 pairs:

| Model      | Mark       | Wrong confirmations | Misses         | Pairs that flipped | p95 latency | Cost per call |
| ---------- | ---------- | ------------------- | -------------- | ------------------ | ----------- | ------------- |
| Haiku 5.5  | `quote`    | 0 of 117 (0%)       | 16 of 93 (17%) | 5 of 70            | 5.5 s       | $0.0003       |
| Haiku 5.5  | `evidence` | 0 of 117 (0%)       | 10 of 93 (11%) | 3 of 70            | 5.2 s       | $0.0002       |
| Sonnet 5.5 | `quote`    | 0 of 117 (0%)       | 3 of 93 (3%)   | 0 of 70            | 4.3 s       | $0.0036       |
| Sonnet 5.5 | `evidence` | 0 of 117 (0%)       | 4 of 93 (4%)   | 2 of 70            | 4.4 s       | $0.0034       |
| Opus 5.5   | `quote`    | 0 of 117 (0%)       | 1 of 93 (1%)   | 1 of 70            | 5.9 s       | $0.0071       |

- **Wrong confirmations: none in 585 calls.** No model confirmed a negation, a question, a quoted
  remark, a hypothetical, sarcasm, a superseded fact, a changed detail, a fact that was only pasted,
  or a memory that asked the checker to answer `asserted`. With 39 pairs per run, the rule of three
  puts the true per-pair rate below about 8% at 95% confidence, so the run shows the checker is
  strict on these kinds, not that it never errs.
- **Misses follow model size.** Each miss is a true memory sent to review as a proposal. Haiku
  missed paraphrases that kept a condition or an attribution ("will move to Berlin if they get the
  job", "the vet said Biscuit isn't diabetic"), and a plain fact inside a sarcastic sentence. Sonnet
  and Opus missed 1 or 2 pairs each.
- **The `«quote»` mark reads as quotation.** For "I'm not allergic to penicillin, that was my
  brother.", Haiku and Sonnet took the marked words for someone else's speech and missed "the owner
  is not allergic to penicillin" in all 6 calls. With the mark renamed `«evidence»`, both confirmed
  it in every call, and Haiku's misses fell from 16 to 10.
- **The prompt's own list causes some misses.** The prompt names a hypothetical as not asserted, so
  Haiku, and Sonnet under the `«evidence»` mark, rejected a memory that keeps your condition word
  for word. A rule that a memory may carry the message's own condition would target these misses.
- **Latency fits the 10 s timeout.** The p95 of each run stayed under 6 s, which includes about 2 s
  of Claude Code start-up per call. 3 of the 1,050 calls took longer than 10 s, the slowest 12.6 s,
  and each would have counted as unsure.
- **Repeats mostly agree.** Sonnet with the `«quote»` mark gave the same answer on every repeat of
  every pair. Haiku changed its answer on up to 5 pairs, each an asserted pair that it also missed.
  No pair the message does not assert ever drew `asserted`; one moved between `not_asserted` and
  `unsure`.

### Recommendation

Map the `checker` role to Sonnet 5.5. A wrong confirmation applies a false memory and a miss costs
you one proposal in the approval digest, so the wrong-confirmation rate decides first; every model
scored 0, so the miss rate decides between them. Sonnet missed 3% to 4% of true memories at about a
cent per 3 checks, Haiku missed 11% to 17%, and Opus missed 1% at twice Sonnet's cost.

Build the checker's input with a mark that is not a quotation word, such as `«evidence»`, and let
the prompt accept a memory that keeps the message's condition or attribution. The consent checker
shares this model, so its spike can reuse this harness with its own prompt and cases.

## Untested

- Real messages. Every message here was written for the spike, and its negatives are clear cases. A
  real message can be longer, hold several facts, or mix languages.
- The labels of 2 asserted pairs are open to argument: "the boss has proposed a move", which Opus
  missed once for the word "proposed", and "the cleaner did the windows", which Sonnet once judged
  not worth remembering.
- The model through the Agent SDK inside nixie rather than `claude -p`, and models outside Claude.
- A retirement check, which the [retirement intent](../../memory/writes.md#retirement-intent) rules
  give its own prompt.
