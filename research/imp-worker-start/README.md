# Spike: worker start inside an imp

This spike times a worker that runs entirely inside its own imp: the Agent SDK's model loop and the
code it runs, with nixie's tools on the host over HTTP MCP. It measures the worker placement in
decision [0003](../../docs/decisions/0003-sdk-placement.md) against the same turn on the host.

## Question

If every worker runs entirely inside its own imp, what does it cost in time per worker: the imp's
create and wake, an SDK turn inside a warm imp against the same turn on the host, and a new or woken
imp to the first text of a worker turn?

## Answer

- A new imp from a prepared image reaches a running guest agent in 472 ms at the median, and a
  sleeping imp wakes to one in 363 ms, both on a shape of 2 vCPUs and 2048 MiB.
- In a warm imp, an SDK turn costs the same as on the host: the first text arrives about 1 s after
  the call in both places, and HTTP MCP adds about 20 ms to init.
- The first turn after a create or a wake loads Claude Code from a cold page cache: a new imp
  reaches first text in 3051 ms at the median, and a woken imp in 2536 ms.
- imp's broker injects the model token through a `custom` secret, so the guest never holds it.
- The prepared image holds 533 MB of `node_modules` and lists at 778 MiB.

Run each worker in its own imp from a minimal prepared image. Warming the page cache might remove
most of the cold-start cost, and the spike left it untested.

## Run it

```bash
cd <nixie_repo>/research/imp-worker-start && bun install
export IMP_URL=http://localhost:7570 IMP_TOKEN=$(<imp_clone>/scripts/dev.sh token)
export CLAUDE_CODE_OAUTH_TOKEN=$(op read "op://<vault>/<item>/credential")
SPIKE_WORK=<scratch_dir> bash run.sh
```

The run needs an imp dev instance first. The [setup](results.md#setup) gives the versions, what each
script does, and the steps that start and remove the instance.

## Results

The [results](results.md) hold the lifecycle, warm-turn and end-to-end tables, the image size and
the model credential.

## Untested

A production imp host, a warmed page cache and workers started in parallel. The
[untested list](results.md#untested) gives the rest.
