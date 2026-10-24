# Spike: tools through an imp reverse forward

This spike runs a Claude Agent SDK tool call from an imp with egress `none` to nixie's tools,
through a reverse forward on the imp's loopback, and compares it with the bridge-address route. It
backs the tools route in decision
[0030](../../docs/decisions/0030-connectors-and-sandbox-environments.md) and the
[sandbox adapter design](../../docs/design/platform/connectors/sandbox-adapter.md).

## Question

Can the reverse forward replace the bridge-address route without a route to impd's management API, a
buffered MCP subscription stream or a failure after sleep?

## Answer

- The relay adds about 0.6 ms to the median HTTP round trip on the local host: 0.909 ms against
  0.273 ms for the bridge allow entry.
- Streamed chunks pass before the response ends, and SDK init over the reverse route completes in
  325 ms, with no 25 s buffering delay.
- An SDK tool call over MCP revision 2026-07-28 succeeds, with the dummy model key injected.
- Under egress `none`, raw connections to the management port fail, and the reverse route keeps
  working.
- After sleep and wake, the forward reopens and another tool call succeeds.

Route the tools through the reverse forward, with the sandbox adapter reopening it after each wake.

## Run it

Start an isolated imp 0.40.2 dev instance first, then run from this directory. The spike refuses to
start until `IMP_URL`, `SPIKE_DEV_DATA` and `SPIKE_WORK` are set:

```bash
bun install --frozen-lockfile
export IMP_URL=http://localhost:<dev_api_port>
export IMP_CLI=<release_cli_path>
export SPIKE_DEV_DATA=<dev_data_directory>
export SPIKE_WORK=<scratch_directory>
IMP_TOKEN=$(IMP_DEV_NAME=<dev_container_name> <imp_checkout>/scripts/dev.sh token) bun run spike
```

The [setup](results.md#setup) gives the versions, the dev instance, the environment variables and
the cleanup.

## Results

The [results](results.md) hold the latency table, the stream and SDK timings, and the isolation
control.

## Untested

The model reply is scripted, and the HTTP samples cover sequential calls on one local host. The
[untested list](results.md#untested) gives the rest.
