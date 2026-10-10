# Spike: tools through an imp reverse forward

An imp with egress `none` reaches nixie's tools through a reverse forward on its loopback. The relay
adds about 0.6 ms to the median HTTP round trip on the local host. It passes streamed chunks before
the response ends, serves a Claude Agent SDK tool call over MCP revision 2026-07-28, and reopens
after sleep and wake. The model grant injects a dummy credential into a local Messages API stand-in;
the run uses no real credential or model service.

## Question

Can the reverse forward replace the bridge-address route without a route to impd's management API, a
buffered MCP subscription stream or a failure after sleep?

## Versions and shape

| Component                               | Version      |
| --------------------------------------- | ------------ |
| imp daemon, CLI, client and guest drive | 0.40.2       |
| Bun                                     | 1.4.2        |
| Claude Agent SDK                        | 0.3.293      |
| Claude Code                             | 2.1.293      |
| MCP server package                      | 2.3.1        |
| Firecracker                             | 1.17.0       |
| Guest                                   | Ubuntu 24.04 |

The same imp serves both measurements: the baseline allows the Docker bridge address; the reverse
route uses egress `none`. Both hold one `anthropic` grant, with a dummy value. The broker's
test-upstream file sends the granted model host to a local HTTPS stand-in with a generated
certificate. The stand-in checks the injected value before it scripts a tool call and a final reply.

[`run.ts`](./run.ts) drives the lifecycle through the pinned CLI. The CLI uses `openReverseForward`
from imp's client and relays each connection to the host's tool endpoint. This includes one local
TCP hop after impd, so the measured delay covers that hop too. The production adapter can deliver
directly to nixie's handler.

## Run it

1. Prepare an isolated checkout of imp 0.40.2 with its dependencies, release CLI, kernel and
   `imp-system.squashfs`, as the
   [imp development guide](https://github.com/zgeoff/imp/blob/v0.40.2/docs/guides/install.md#set-up)
   describes. Keep its data directory on a disk filesystem. Start its dev instance with
   `IMP_DEV_TAILNET=0`, a distinct container name and a port offset; import `ubuntu:24.04` as the
   image `ubuntu`.
2. Install this package: `bun install --frozen-lockfile`.
3. Set the local dev endpoint, its token and scratch paths, then run the spike:

   ```bash
   export IMP_URL=http://localhost:<dev_api_port>
   export IMP_CLI=<release_cli_path>
   export SPIKE_DEV_DATA=<dev_data_directory>
   export SPIKE_WORK=<scratch_directory>
   IMP_TOKEN=$(IMP_DEV_NAME=<dev_container_name> <imp_checkout>/scripts/dev.sh token) bun run spike
   ```

   Set `SPIKE_BRIDGE` if the Docker bridge gateway differs from `172.17.0.1`. Ports 8793 and 8794 on
   the host must be free. The loopback port 8901 belongs to the test imp. The host endpoints bind
   all interfaces so both the bridge baseline and the CLI's loopback relay reach the same server;
   the MCP endpoint checks its random bearer token.

4. Read `results/<run_id>/*.jsonl` and the scratch logs. Expect successful SDK init and tool results
   on both routes and after wake, a sleeping state before wake, a reachable management-port control
   under the baseline policy, and failed raw connections under egress `none`.
5. Stop the dedicated dev instance and remove its containers, volumes, generated image and data when
   the run ends. The script removes its imp and dummy secret, stops its server and relay, and
   restores any prior broker test-upstream file in `finally`. It refuses pre-existing probe names.
   Each run writes to its own results directory so a rerun preserves earlier evidence.

## Findings

Each HTTP measurement drops 10 warm-up requests and measures 100 sequential requests. The preserved
run gives these values:

| Route                        | Median   | 95th percentile |
| ---------------------------- | -------- | --------------- |
| Bridge allow entry           | 0.273 ms | 0.377 ms        |
| Reverse forward, egress none | 0.909 ms | 1.111 ms        |

The synthetic `/stream` endpoint sends its first chunk at once and closes after 250 ms. The reverse
route delivers that first chunk in 1.16 ms and the final chunk after about 253 ms. These timings
measure the synthetic endpoint, not the MCP subscription stream. The v2 endpoint logs
`server/discover`, `subscriptions/listen`, `tools/list` and `tools/call`. SDK init over the reverse
route completes in 325 ms, so the relay does not incur the 25 s buffering delay from the
tools-endpoint spike.

The model stand-in receives the injected dummy key, and the SDK receives the structured result
`{ "n": 42 }` and ends successfully. A single turn per route does not establish a performance
difference between SDK turns; the 100-request HTTP samples measure the relay overhead.

The control reaches the live management port through the bridge allow entry. This is the only target
with a positive control; the baseline does not allow the guest gateway or external address. With
egress `none`, raw TCP connections fail to the management port through both the guest gateway and
host bridge, and to an external address. The paired management-host result demonstrates the policy
change. The gateway and external failures are observations without a positive control, so they do
not establish which component refused the connection. The reverse route continues to work under that
policy. The imp reaches `sleeping`, the CLI reports that its forward ended, and after wake the CLI
listens again and another SDK tool call succeeds.

## Limits

The model reply is scripted; the spike tests the SDK, credential injection and MCP transport, not
model quality or a real provider's timing. The HTTP samples cover sequential calls on one local
host, not load or a remote impd. The CLI supplies reconnect behavior; nixie's sandbox adapter must
implement the same lifecycle around `openReverseForward`. The result supports the recommended route
and leaves its owner decision open.
