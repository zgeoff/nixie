# Spike: how a fetch sandbox starts

This spike times the ways a fetch sandbox can start on a production impd host: a plain `imp new`
from the fetch image, `imp new` from a template, `imp fork`, a wake of a kept imp, and an exec in an
awake imp. It measures the cost that
[the sandbox's lifetime](../../docs/design/platform/connectors/web-fetch.md#the-sandboxs-lifetime)
in the web fetch design waits on.

## Question

What does a fresh fetch sandbox cost on the impd that nixie runs on, from the create to a first
command in the guest, and does a template, a fork, a warm pool or a sandbox kept per conversation
start faster? Can a fetch trust the exit code of `imp new`?

## Answer

- On impd 2.8.3, a plain `imp new` to a first exec took a median of 1.24 s over 5 runs, 984 to 1379
  ms.
- A template and a fork gained nothing within that spread, with medians of 1117 and 1041 ms.
- A kept imp that wakes cost 0.56 s, and an exec in an awake imp 0.11 s.
- Every one of the 22 timed creates exited 0, the 5 from the conversation image included.

Start one new sandbox per fetch from the fetch image, with no template, fork or pool.

## Run it

```bash
FETCH_IMAGE=<fetch_image> CONVERSATION_IMAGE=<conversation_image> RUNS=5 \
  bash research/fetch-sandbox-start/time-starts.sh > <output_file> 2>&1
```

The [setup](results.md#setup) gives the versions, the routes, the login and the cleanup check.

## Results

The [results](results.md) hold the medians per route, the reasons against a template, a fork or a
pool, and every run.

## Untested

The start of the fetcher process and a real fetch inside a new sandbox. The
[untested list](results.md#untested) gives the rest.
