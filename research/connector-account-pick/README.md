# Spike: the model picks a connector account from its label

This spike gives the model a mock connector tool whose `connection` values are short IDs, with each
account's label only in the value's description, and checks which account the model picks. It tests
[the connection argument](../../docs/design/platform/connectors/connector.md#the-connection-argument)
of the connector design. Every account, label and message here is invented.

## Question

Does the model pick the right account when the label appears only in the tool's input schema, and
how often? Can the [model eval spike](../model-eval/README.md) take this case as it is? What
accuracy should later evals require of this case?

## Answer

- Haiku, Sonnet and Opus passed the right short ID on the first call in all 351 named runs, which
  bounds the miss rate at about 0.9% at 95%.
- In all 65 ask runs, whose message gave no hint of an account, the model made no call and asked. On
  the implied cases, where the content points at one account, Opus picked the right account each
  time, and Haiku and Sonnet mostly asked.
- The label drives the pick: with no label in the schema, Haiku asked in 132 of 135 named runs.
- The case needs its own harness, because the model eval's runner runs fixed tasks on a fixed tool
  list.
- A later eval passes a model with no wrong-account call over at least 100 named runs, and at least
  95% right on the first call.

Keep the short ID with the label and account in each value's description.

## Run it

```bash
bun install
bun run.ts --out results/<run_name> --configs haiku-low --samples 5
bun run.ts --out results/<run_name> --configs sonnet-low,opus-low --arms id-label --samples 4
bun report.ts results/<run_name> --misses
bun report.ts runs/main.jsonl
bun test
```

The [setup](results.md#setup) gives the versions, the sign-in, and the cases and arms.

## Results

The [results](results.md) hold the table per model and arm and the pass bar, and [runs/](runs/)
holds the recorded run.

## Untested

Models outside Claude, a long conversation with many connectors, and the second turn. The
[untested list](results.md#untested) gives the rest.
