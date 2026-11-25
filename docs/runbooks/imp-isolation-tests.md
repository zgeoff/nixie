# Run the imp isolation tests

The test in `adapters/sandbox-imp/src/sandbox/build-imp-port.imp.test.ts` checks that a conversation
imp made through the imp adapter on a real impd reaches the model host through the broker. It also
checks that a worker imp gets no answer from a direct request to the model host with a key of its
own, to another host, or to a literal address. The tests skip unless the variables below are set,
and they need a host with `/dev/kvm` and impd. The imp port's other cases run in the unit run on the
test impd from `@impz/testing`, and impz's own e2e suites check that an imp reaches nothing else.

1. Start an impd that you can create imps and secrets on, and get a token with manage scope for it.
2. Import an image that holds `sh` and `curl`, such as `ubuntu:24.04` with `curl` installed.
3. Run the test from the repo root:

   ```bash
   NIXIE_IMP_TEST_URL=<impd_url> \
   NIXIE_IMP_TEST_TOKEN=<impd_token> \
   NIXIE_IMP_TEST_IMAGE=<image_name> \
   bun run test:imp adapters/sandbox-imp/
   ```

   Set `NIXIE_IMP_TEST_UPSTREAM_HOST=<host_address>` as well to run the route test. It starts a
   stand-in upstream on that address of the test host, which impd must reach, and checks that a
   sandbox granted the model secret of one route reaches no other route of the gateway.

   When impd cannot reach the test host, use a relay imp as [the codex gates](#the-codex-gates) do.
   Pick a free port `<port>`. Forward the relay's port 18080 to `<port>` on this machine, and run
   `relay-forward.ts <port> 18080` in the relay. Then set `NIXIE_IMP_TEST_UPSTREAM_HOST` to the
   relay's address and `NIXIE_IMP_TEST_UPSTREAM_PORT=<port>`, so the stand-in listens on `<port>`.

### The codex image

`apps/server/src/part/list-image-needs.imp.test.ts` runs the pinned Codex CLI in a sandbox on the
codex image. Build the image into impd from `guests/codex/Dockerfile` with the repo root as the
build folder, as step 1 does for the fetch image, and set
`NIXIE_IMP_TEST_CODEX_IMAGE=<codex_image_name>` beside the first 2 variables of step 2. Rebuild it
after each change under `guests/codex/`.

### The codex gates

`integration/codex-gates.imp.test.ts` runs each release gate of the Codex harness against scripted
model replies, through the real model gateway: the first request, the bearer header, a turn that
calls a tool, a tool result inside and one after the tool-call wait, a failed call, a retried call,
a compaction inside one turn, a down tool server, a recall result of the page limit, the capture tag
segment, and the memory of the `codexTask` size row. Each case asserts that the gateway's count
equals the sum of the turn's `call` frames. The 2 tool-call wait cases check only what reaches the
model, and skip that count. The late-result case prints the turn's last frame and the model's second
request, which holds the text the CLI sends in place of the result. The memory case prints one probe
line: `oom_kill` from `/proc/vmstat`, the cgroup's `memory.peak` and `memory.events`, and
`MemTotal`. It passes when the turn ends with no out-of-memory kill. Set
`NIXIE_IMP_TEST_CODEX_MEMORY_MIB` to probe another size. It defaults to the row's figure.

The suite skips until it has 2 more variables:

- `NIXIE_IMP_TEST_CODEX_RELAY`: the origin of the relay, `http://<relay_address>:18081`.
- `NIXIE_IMP_TEST_CODEX_GATEWAY_PORT`: the fixed loopback port that the suite's model gateway binds.

An impd on another host cannot reach this machine, and an imp reaches only `https://` hosts that its
policy grants, through the broker. Each case therefore gives its secret a host name of its own,
`models-<id>.example.com`, and an `upstream` that points the broker at a relay imp. The relay passes
each connection through a reverse forward to the gateway on this machine.

1. Create the relay on the codex image with no egress:
   `impz new --image <codex_image_name> --policy none agent-test-relay-<id>`.
2. Bring the relay's port 18080 to the gateway's port on this machine, and leave the command
   running: `impz proxy agent-test-relay-<id> --reverse 18080:<gateway_port>`.
3. Copy `integration/test-utils/relay-forward.ts` into the relay, and start it:
   `impz cp integration/test-utils/relay-forward.ts agent-test-relay-<id>:/tmp/relay-forward.ts`,
   then `impz exec agent-test-relay-<id> -- bun /tmp/relay-forward.ts 18081 18080`. Leave it
   running.
4. Read the relay's address from `impz ls --json`, and set `NIXIE_IMP_TEST_CODEX_RELAY` to
   `http://<relay_address>:18081`.
5. Run the suite from the repo root with `NIXIE_IMP_TEST_URL`, `NIXIE_IMP_TEST_TOKEN`,
   `NIXIE_IMP_TEST_CODEX_IMAGE`, the 2 variables above and
   `bun run test:imp integration/codex-gates.imp.test.ts apps/server/src/part/list-image-needs.imp.test.ts`.

### The plan login checks

`integration/codex-plan-login.imp.test.ts` runs a turn on a real ChatGPT plan login through a model
gateway that holds a plan route, as the [plan login runbook](chatgpt-plan-login.md) sets up. One
case runs a turn that calls a tool, and asserts that the gateway's count for the sandbox equals the
sum of the turn's `call` frames. It prints both figures first, as `plan login count probe`. The
other case sends a turn past the context window and prints the last frame that Codex gives, as
`plan login context overflow probe`. The suite skips until these variables are set, beside
`NIXIE_IMP_TEST_URL`, `NIXIE_IMP_TEST_TOKEN` and `NIXIE_IMP_TEST_CODEX_IMAGE`:

- `NIXIE_IMP_TEST_CODEX_PLAN_GATEWAY`: the gateway's model listener, as impd's broker reaches it.
- `NIXIE_IMP_TEST_CODEX_PLAN_CONTROL` and `NIXIE_IMP_TEST_CODEX_PLAN_CONTROL_TOKEN`: the control
  listener, as this machine reaches it, and its token.
- `NIXIE_IMP_TEST_CODEX_PLAN_ROUTE_KEY`: the route key.
- `NIXIE_IMP_TEST_CODEX_PLAN_ROUTE`: the plan route's ID, which defaults to `gpt-6-luna`.
- `NIXIE_IMP_TEST_CODEX_PLAN_MODEL`: the route's model, which defaults to `gpt-6-luna`.

The route must show `active` at `GET /chatgpt-logins`. Run the suite from the repo root with
`bun run test:imp integration/codex-plan-login.imp.test.ts`. The cases add a secret named
`nixie-test-<id>` and a sandbox at the gateway, and remove both when they end. The suite uses the
account's plan, so a run spends plan usage.

To check that the path works before a run, call `https://models-<id>.example.com/` from a second imp
on the codex image that holds a grant of a secret with that host and the relay's `upstream`. The
request must reach a listener on the gateway's port with `authorization: Bearer <secret value>`.

Every `impz` call takes its target from `IMP_URL` and `IMP_TOKEN`, set on the command, never from a
saved host. Each case creates its own imp, named `nixie-<id>` by the adapter, and its own secret
named `nixie-test-<id>`. A stopped run leaves them behind. When the run ends, remove the relay, the
`impz proxy` and `bun relay-forward.ts` processes, and any imp, secret or image that the run
recorded, each by its exact name and never by a pattern, because the impd holds other people's
`nixie-*` imps.

Expect `0 fail`, with no skipped test. The `test:imp` script runs the `*.imp.test.ts` files under
the imp lane's limit per test.

The script runs the tests with `bunfig.imp.toml`, which leaves out the web test preload, whose mock
server and DOM take over `fetch` and `WebSocket`, so no call would reach impd. A plain `bun test`
loads the web preload, and the suite fails at once with `the web test preload is loaded`.

Each test creates its own imp and its own secret named `nixie-test-<id>` with a dummy value. A test
refuses a secret name that impd holds already, because the run did not add that secret, and it
removes only a secret it added. When a test ends, fails, or fails part way through setup, it removes
its imps first and its secret after. A run that you stop with Ctrl-C skips that cleanup. Remove what
it left with impd's API: the imps the run created, each named `nixie-<id>`, and each
`nixie-test-<id>` secret.

## The fetch sandbox tests

The imp tests in `apps/server/src/part/start-web-fetch.imp.test.ts` run the fetch sandbox on the
fetch image. The web fetch tool fetches `https://example.com/`, a fetch sandbox reaches `1.1.1.1`
over TCP, and a direct TCP connection from a fetch sandbox to impd or to each host address fails.
The direct connections skip the fetcher's own address check, so only the network layer decides them.
The tests skip unless the variables below are set.

A target with no listener refuses every connection, so a sandbox's failed connection to it shows
nothing about isolation. The machine that runs the tests therefore connects to each target first.
The test fails when an impd address refuses that machine, because impd listens there. A host address
may have nothing on impd's port, so the test prints a host address that refuses that machine as
unprovable instead of failing on it. A target that drops the connection fails the test either way,
because a drop shows nothing about whether a listener exists. A machine with no routable IPv6
address cannot reach an IPv6 target, so the test prints each such target as unprovable instead of
failing on it. Run the tests from a machine with IPv6 to prove the IPv6 targets too.

1. Build the fetch image into impd from `guests/fetch/Dockerfile`, with the repo root as the build
   folder, as impz's
   [images guide](https://github.com/zgeoff/impz/blob/main/docs/guides/images.md#build-an-image)
   describes. The image name you choose is `<fetch_image_name>` in the next step.

   impd refuses a `FROM` line that names its image with a variable, so the Dockerfile writes out the
   Bun version from `.bun-version`. When `.bun-version` changes, change both `FROM` lines to match.

2. Run the tests from the repo root:

   ```bash
   NIXIE_IMP_TEST_URL=<impd_url> \
   NIXIE_IMP_TEST_TOKEN=<impd_token> \
   NIXIE_IMP_TEST_HOST_ADDRESSES=<host_addresses> \
   NIXIE_IMP_TEST_FETCH_IMAGE=<fetch_image_name> \
   bun run test:imp apps/server/
   ```

   `NIXIE_IMP_TEST_EGRESS_DENY` takes the list that impd reads from `IMP_EGRESS_DENY`. The test
   resolves impd's name on the machine that runs it and probes each address, because the guest
   cannot resolve that name.

Expect `0 fail`, with no skipped test. Each test destroys the imps it created when it ends; a run
that you stop with Ctrl-C leaves them, each named `nixie-<id>`.

## The computer sandbox tests

The imp tests in `apps/server/src/part/start-computer-part.imp.test.ts` run the computer sandbox on
the computer image. They check that a command sees only a loopback and no display socket, that the
command proxy refuses a tunnel, that the terminal account cannot read the browser profile or signal
or trace Chromium, and that the terminal's cgroup holds 512 MiB with no swap. One test moves the
files of a stand-in browser sandbox and shell sandbox into the computer and checks that both old
sandboxes are gone. Five more tests drive the guest's screen code on the image's real display: Xvfb,
openbox, xterm and Chromium. They check that a screenshot is a PNG of 1280 by 800, and that a click
on a page in Chromium changes the page's title. They also check that a click on the terminal returns
`USE_RUN`, that a click on the browser's address bar returns `USE_BROWSER_OPEN`, and that a click
returns `SCREEN_CHANGED` once a new tab replaced the window it was bound to.

One test sends the keys of a take-over's paste through a watch to the real VNC server. It checks
that `hi` and a line break reach the focused field of a page in Chromium. CI never runs it, so run
it after each change to the VNC server's options or to the keys that the web client sends.

1. Build the computer image into impd from `guests/computer/Dockerfile`, with the repo root as the
   build folder, as step 1 of [the fetch sandbox tests](#the-fetch-sandbox-tests) does. Rebuild it
   after each change under `guests/computer/` or a package the guest imports.
2. Run the tests from the repo root:

   ```bash
   NIXIE_IMP_TEST_URL=<impd_url> \
   NIXIE_IMP_TEST_TOKEN=<impd_token> \
   NIXIE_IMP_TEST_HOST_ADDRESSES=<host_addresses> \
   NIXIE_IMP_TEST_COMPUTER_IMAGE=<computer_image_name> \
   bun run test:imp apps/server/src/part/start-computer-part.imp.test.ts
   ```

   The tests list and remove only the sandboxes that they created, so an impd that runs other
   sandboxes keeps them.

The tests skip while any of the 4 variables is unset. With all 4 set, expect `0 fail`, with one
skipped test: the paste of characters outside ASCII, which waits for the Chromium release that
carries the upstream keymap fix. Each test boots its own computer sandbox. Remove the image when you
finish, by its exact name.
