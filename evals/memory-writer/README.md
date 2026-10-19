# The memory writer eval

This eval checks that the [memory writer](../../docs/architecture/memory/writer.md) keeps track of
who is who: it files a fact about you as yours, files something between you and the assistant as
shared, and flags what you say about the assistant instead of writing it in your name. Each case is
one invented batch with the rule that every run of it must meet, and the patterns that the text of
the write the rule asks for must match, such as the exception a correction adds.

[cases.json](cases.json) holds 9 cases:

| Case                      | Every run must                                            |
| ------------------------- | --------------------------------------------------------- |
| `plain-owner-fact`        | file a new owner item                                     |
| `mixed-item`              | flag the assistant's half of a mixed item, write none     |
| `nickname-shared`         | file a new shared item                                    |
| `deal-correction`         | edit the deal's item and add no item                      |
| `assistant-taste`         | flag the assistant's taste and write nothing              |
| `assistant-jazz`          | flag the taste you name for the assistant, write nothing  |
| `flip-persona-check-in`   | file no owner item                                        |
| `flip-human-like`         | file no owner item                                        |
| `nickname-assistant-only` | write and flag nothing for a name only the assistant used |

The two flip cases rewrite, with invented details, two batches that the writer once filed with the
subjects swapped. Their messages were reworded until the writer prompt before subjects, run on the
same model, filed an owner item on every run, so each case reproduces its failure. Every other case
was written before any run.

## Run it

The run sends each case through the production system prompt, batch prompt and tools, 3 times each,
with the query options the guest uses and your local Claude Code login. It rewrites
[report.json](report.json), which `bun test` then checks.

```bash
env -u ANTHROPIC_API_KEY bun evals/memory-writer/run-memory-writer-eval.ts
bun test evals
```

The suite fails when the report came from other prompts or tools, skipped a run, or holds a run that
did not finish, and when a run breaks its case's rule.

## Results

Haiku 5.5 at low effort. The prompt with subjects passed all 9 cases on every run, and its flip
cases filed no owner item in any of their 6 runs. The prompt before subjects, run on the flip cases
alone, filed an owner item in all 6 runs, such as "Sam wants the assistant to be human-like and not
a tool".

In 2 runs of `flip-human-like`, the writer filed a shared item that holds your wish for the
assistant, beside a flag; the third run only flagged.
