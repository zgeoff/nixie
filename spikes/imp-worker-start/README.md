# Spike: worker start inside an imp

This spike times a worker that runs entirely inside its own imp: the Agent SDK's model loop and the
code it runs, with nixie's tools on the host over HTTP MCP. A new imp from a prepared image runs its
first command in under 0.5 s, and a sleeping imp wakes and runs one in under 0.4 s. Once the imp is
warm, an SDK turn inside it costs the same as on the host: the first text arrives about 1 s after
the call in both places. The cost sits in the first turn after a create or a wake, which loads
Claude Code from a cold page cache. A new imp reaches the first token of a worker turn in about 3.1
s, and a woken imp in about 2.5 s. imp's broker injects the model token, so the guest never holds
it.

## Question

If every worker runs entirely inside its own imp, what does it cost in time per worker?

1. imp lifecycle: `imp new` from a prepared image, and a wake from sleep, each to the guest agent
   answering.
2. Inside the imp: an SDK `query()` call to the init message, to the first streamed text, and to the
   result, with `tools: []` and 0, 1 or 3 MCP tools on the host over HTTP.
3. The same turn on the host, so the in-imp overhead stands apart.
4. End to end: a new or woken imp to the first text of a worker turn.

## Versions

| Component                   | Version                                   |
| --------------------------- | ----------------------------------------- |
| Claude Agent SDK            | 0.3.293                                   |
| Claude Code                 | 2.1.293, from the SDK's native package    |
| `@modelcontextprotocol/sdk` | 1.32.1                                    |
| Bun                         | 1.4.2, on host and in guest               |
| imp                         | 0.40.2, dev instance and release CLI      |
| Model                       | `claude-haiku-5-5`                        |
| Host                        | WSL2, Linux 6.6.87.2, KVM, 16 GiB for imp |

## Setup

[`turn.ts`](./turn.ts) runs one `query()` and prints a JSON line at the call, at the init message,
at the first `text_delta` stream event, and at the result. It runs unchanged in both places. It sets
`tools: []`, `strictMcpConfig`, `settingSources: []`, `maxTurns: 1`, a fresh neutral `cwd`, and
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. The prompt asks for one sentence and no tool call, so
the tool count changes only the startup work: the MCP connection and the tool list in the request.

[`serve.ts`](./serve.ts) serves 3 stub tools as a stateless Streamable HTTP MCP server on the Docker
bridge gateway `172.17.0.1`, behind a bearer token that each run makes fresh. The path picks how
many tools it lists. Host turns and imp turns reach the same server.

[`bench.ts`](./bench.ts) drives every phase from the host and takes every time from the host clock,
around `imp` CLI calls and the arrival of `turn.ts`'s lines. Guest-side times count from the
`query()` call inside one process, so no time mixes the two clocks. Each phase runs 10 samples.

[`run.sh`](./run.sh) does the rest:

1. It prepares the image `nixie-spike-worker-tpl`: an imp from impd's `ubuntu` image, with
   `ca-certificates`, the host's Bun binary and this package installed in `/app`, made into an
   [imp template](https://github.com/zgeoff/imp/blob/v0.40.2/docs/guides/templates.md).
2. It stores the model token as a `custom` secret for `api.anthropic.com`, as an
   `authorization: Bearer` header. Each imp gets policy `box` with `172.17.0.1/32` as its only allow
   entry, and a grant for the secret. The guest sets `CLAUDE_CODE_OAUTH_TOKEN` to a placeholder.
3. It makes 2 warm-up imps, so impd has a
   [boot template](https://github.com/zgeoff/imp/blob/v0.40.2/docs/architecture/boot-templates.md)
   for the shape (2 vCPUs, 2048 MiB), then creates the long-lived imp `nixie-spike-w` and runs one
   turn in it.
4. It runs the phases in order: `cli`, `lifecycle`, `wake`, `sdk`, `e2e-new`, `e2e-wake`. The `sdk`
   phase alternates host and imp turns over the tool counts, so a drift in API latency hits both
   placements alike.
5. It copies impd's own timing lines into `results/impd.log`, prints the summary, and checks every
   file it wrote for the token's value.

The script refuses to start when an imp, image or secret with one of its names exists. A trap
removes the imps, the template and the secret it made, and stops the MCP server, on exit. Each run
empties `results/` first, so a summary never mixes runs.

## Run it

1. Clone imp at the tag outside this repository, put the release kernel at `kernel/out/vmlinux`, and
   run `bun install` there. Put the release CLI on your `PATH` as `imp`.

   ```bash
   git clone --branch v0.40.2 --depth 1 https://github.com/zgeoff/imp <imp_clone>
   cd <imp_clone> && bun install
   gh release download v0.40.2 -R zgeoff/imp -p vmlinux -D kernel/out
   gh release download v0.40.2 -R zgeoff/imp -p imp-linux-x64 -O <bin_dir>/imp
   chmod +x <bin_dir>/imp
   ```

2. Start a dev instance off the tailnet, with its data directory on a disk filesystem:

   ```bash
   export IMP_DEV_NAME=nixie-spike-worker IMP_DEV_PORT_OFFSET=500 IMP_DEV_DATA=<data_dir>
   IMP_DEV_TAILNET=0 scripts/dev.sh up
   ```

3. Install this spike's packages, then run it with the instance's URL and token and the model token.
   The script refuses any `IMP_URL` that is not `http://localhost:*`.

   ```bash
   cd <nixie_repo>/spikes/imp-worker-start && bun install
   export IMP_URL=http://localhost:7570 IMP_TOKEN=$(<imp_clone>/scripts/dev.sh token)
   export CLAUDE_CODE_OAUTH_TOKEN=$(op read "op://<vault>/<item>/credential")
   SPIKE_WORK=<scratch_dir> bash run.sh
   ```

   Results land in `results/`, which git ignores. A run makes about 90 short model calls.

4. Stop the instance and remove what it made. `dev.sh down` removes both containers and their
   volumes, and keeps the host image.

   ```bash
   <imp_clone>/scripts/dev.sh down
   docker rmi <dev_host_image>
   rm -rf <data_dir> <scratch_dir> <imp_clone>
   ```

## Answer

Each table gives the median and the 90th percentile (nearest rank) of 10 samples, in milliseconds.
Every turn exited 0, with its MCP server `connected` whenever it had one.

### 1. imp lifecycle

| Step                               | Median | p90 |
| ---------------------------------- | -----: | --: |
| `imp new` from the prepared image  |    392 | 430 |
| then `imp exec -- true`            |     79 |  83 |
| create to the agent answering      |    472 | 513 |
| `imp grant` of the model secret    |     64 |  65 |
| `imp wake` of a sleeping imp       |    183 | 197 |
| then `imp exec -- true`            |    185 | 215 |
| wake to the agent answering        |    363 | 404 |
| `imp ls`, the CLI's own round trip |     48 |  50 |

Every create restored impd's boot template. impd logged a median of 338 ms per create, about 170 ms
of it in the guest agent's start. The only create without a boot template, the first boot of this
shape, took 796 ms in impd, 593 ms of it in the guest kernel and agent. impd logged a median wake of
100 ms. The exec right after a wake takes 185 ms against 79 ms after a create, because the woken
guest faults its memory back in from the snapshot.

### 2 and 3. A turn in a warm imp against the host

The imp is awake and has run turns before. Times count from the `query()` call.

| Placement | MCP tools | Init median | Init p90 | First text median | First text p90 | Result median |
| --------- | --------: | ----------: | -------: | ----------------: | -------------: | ------------: |
| host      |         0 |         192 |      226 |               939 |           1054 |           964 |
| host      |         1 |         215 |      222 |               970 |           1046 |           996 |
| host      |         3 |         217 |      230 |               968 |           1034 |           993 |
| imp       |         0 |         188 |      407 |               900 |           1165 |           939 |
| imp       |         1 |         209 |      227 |               777 |            964 |           959 |
| imp       |         3 |         213 |      258 |               803 |            986 |           965 |

A warm imp adds no time a sample of 10 can see. Init and first text differ by less than the spread
of either placement. Bun loads `turn.ts` in about 65 ms in both places. Counted from the host's
spawn of the process, the first text arrives at 1033 ms on the host and 954 ms in the imp with 3
tools; the imp figure includes `imp exec`. The SDK's `duration_api_ms` was 737 to 756 ms in every
cell, so the model call dominates the turn.

The first sample of the phase, with 0 tools, ran cold in both places: the imp had just woken at the
end of the wake phase, and the host's empty `HOME` held no Bun cache yet. Each is the slowest init
of its cell, 876 ms in the imp and 796 ms on the host, and the nearest-rank p90 leaves both out.

The two routes to the model differ: host turns go straight to `api.anthropic.com`, and imp turns go
through the broker's TLS terminator, which serves HTTP/1.1 and swaps the token. That hop cost
nothing measurable here.

HTTP MCP adds about 20 ms to init on either side: 0 tools against 1 or 3. Claude Code connects to
the server before it emits init, and reconnects per turn because every `query()` is a new process.

### 4. End to end

Times count on the host from before `imp new`, or before the `imp exec` that wakes the imp, to each
line's arrival. Each turn has 3 tools.

| Milestone                   | New median | New p90 | Woken median | Woken p90 |
| --------------------------- | ---------: | ------: | -----------: | --------: |
| `imp new` returns           |        383 |     430 |              |           |
| `imp grant` takes           |         64 |      68 |              |           |
| `turn.ts` reaches `query()` |        937 |     973 |          865 |      1013 |
| init message                |       2288 |    2849 |         1821 |      2046 |
| first text                  |       3051 |    3605 |         2536 |      2807 |
| result                      |       3100 |    3625 |         2600 |      2839 |

The first turn in a fresh or woken imp is slower than a warm one, inside the guest:

| Guest-side, from `query()` | New median | Woken median | Warm imp median |
| -------------------------- | ---------: | -----------: | --------------: |
| Bun module load            |        341 |          498 |              63 |
| init message               |       1341 |          922 |             213 |
| first text                 |       2105 |         1679 |             803 |

A new imp's disk is a reflink copy of the template, so the guest reads the 253 MB Claude Code binary
and Bun from disk on the first turn. A woken guest faults the pages back in from its memory
snapshot. A warm worker turn reaches first text in about 1 s, so a cold start adds about 2 s for a
new imp and about 1.6 s for a woken one.

### Image and preparation

- The package needs 533 MB of `node_modules`. The SDK pulls both native Claude Code packages,
  `claude-agent-sdk-linux-x64` (242 MB) and `claude-agent-sdk-linux-x64-musl` (236 MB), and a glibc
  guest runs only the first. Bun adds 76 MB.
- `bun install --frozen-lockfile` took 17.9 s in the guest. The template took 139 to 274 ms to make
  from the stopped imp, and `imp image ls` lists it at 778 MiB.
- Nothing else goes in the image: the SDK starts its bundled binary, and no global Claude Code
  install or `~/.claude` is needed.

### The model credential

The broker injected the model token, and the guest held only the placeholder. A `custom` secret with
`--header authorization --scheme bearer` works for the OAuth token that `claude setup-token` makes,
as the [placement spike](../sdk-placement/README.md#5-the-token-through-a-broker-grant) found on imp
0.38.1. imp's `anthropic` kind sets `x-api-key`, which an OAuth token does not use. `imp audit`
listed 3 paths per turn on `api.anthropic.com`: `/v1/messages`, `/api/claude_code/settings` and
`/api/claude_code/policy_limits`. No file the run wrote held the token's value.

The secret is static. A setup token lasts a year, so it fits a `custom` secret. A token that expires
sooner needs imp's `oauth` kind, which the spike did not try.

## Untested

- A production imp host. The run used a dev instance on WSL2 with one host kernel; a server's disk,
  CPU and kernel change the cold-start figures most.
- Warming the page cache. Pre-reading the Claude Code binary in the template, or a boot template
  that holds a booted guest with the binary resident, might remove most of the cold-start cost.
- Workers started in parallel. Every create, wake and turn ran one at a time.
- A turn that calls a tool, or runs code, or lasts past a few seconds.
- Creates without a boot template beyond the one first boot, and elastic imps, which never restore
  one.
- An image built with `imp image build` from a Dockerfile, and an install that skips the musl
  package.
