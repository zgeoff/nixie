# The memory writer eval

This eval checks that the [memory writer](../../docs/architecture/memory/writer.md) keeps track of
who is who: it files a fact about you as yours, files something between you and the assistant as
shared, flags what you say about the assistant instead of writing it in your name, gives a fact you
say ends an end time, and marks an address you give sensitive. Each case is one invented batch with
the rule that every run of it must meet, and the patterns that the text of the write the rule asks
for must match, such as the exception a correction adds.

[cases.json](cases.json) holds 12 cases, sent from one time zone. The two time-limit cases send
their messages in 2030, because Claude Code gives the model the real date, and a model that sees the
end of an invented week already past skips the fact as lapsed:

| Case                      | Every run must                                            |
| ------------------------- | --------------------------------------------------------- |
| `plain-owner-fact`        | file a new owner item                                     |
| `new-address-sensitive`   | file a new owner item marked sensitive                    |
| `mixed-item`              | flag the assistant's half of a mixed item, write none     |
| `nickname-shared`         | file a new shared item                                    |
| `deal-correction`         | edit the deal's item and add no item                      |
| `assistant-taste`         | flag the assistant's taste and write nothing              |
| `assistant-jazz`          | flag the taste you name for the assistant, write nothing  |
| `flip-persona-check-in`   | file no owner item                                        |
| `flip-human-like`         | file no owner item                                        |
| `nickname-assistant-only` | write and flag nothing for a name only the assistant used |
| `trip-this-week`          | file a new owner item that ends at the end of that Sunday |
| `off-until-friday`        | file a new owner item that ends at the end of that Friday |

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
did not finish, and when a run breaks its case's rule. A new item breaks the rule when its end time
differs from the one its case names, or when it has one and its case names none.

## Results

Haiku 5.5 at low effort. The tools with the sensitive mark passed all 12 cases on every run. Each
run of `new-address-sensitive` marked its address sensitive, and no run of another case marked an
item.

The prompt with end times passed all 11 of its cases on every run, and each run of the two
time-limit cases staged the end time its case names. While those cases were dated before the real
date, the writer skipped "this week" as already past in 1 of 3 runs, even with a rule to stage it,
and a run of the whole set once missed the flag of `mixed-item` in 1 of 3 runs.

The prompt with subjects, before end times, passed all 9 of its cases on every run, and its flip
cases filed no owner item in any of their 6 runs. The prompt before subjects, run on the flip cases
alone, filed an owner item in all 6 runs, such as "Sam wants the assistant to be human-like and not
a tool".
