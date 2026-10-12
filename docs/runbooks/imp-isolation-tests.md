# Run the imp isolation tests

The isolation tests in `adapters/sandbox-imp/src/build-imp-port.test.ts` check what a conversation
imp reaches through the imp adapter on the real impd port. Through the reverse forward it reaches
the tool endpoint. Through the broker it reaches only the model host. Every direct connection fails:
the internet, the model host, impd, the gateway, the metadata service and the tailnet's resolver.
With the host addresses set, a further test checks that a public imp reaches the internet and never
a host address or impd. The tests skip unless the variables below are set, and they need a host with
`/dev/kvm` and impd.

A guest cannot resolve impd's name or the model host's, so a probe of either name fails at the
lookup whatever the network allows. The machine that runs the tests resolves each name, and the
guest probes each address. A direct probe passes only on curl's exit for a refused connection (7) or
a dropped one (28), never on a failed lookup. The tests that expect refusals also probe the imp's
own tool route, which must answer, so a guest that reaches nothing at all fails them.

1. Start an impd that you can create imps and secrets on, and get a token with manage scope for it.
2. Import an image that holds `sh`, `curl` and `ip`, such as `ubuntu:24.04` with `curl` installed.
3. Run the tests from `adapters/sandbox-imp`:

   ```bash
   cd adapters/sandbox-imp
   NIXIE_IMP_TEST_URL=<impd_url> \
   NIXIE_IMP_TEST_TOKEN=<impd_token> \
   NIXIE_IMP_TEST_IMAGE=<image_name> \
   NIXIE_IMP_TEST_HOST_ADDRESSES=<host_addresses> \
   bun test src/build-imp-port.test.ts
   ```

   Leave out `NIXIE_IMP_TEST_HOST_ADDRESSES` to skip the public egress test. It takes the same list
   that impd reads from `IMP_HOST_ADDRESSES`.

Expect `0 fail`, with no skipped test.

The package's `bunfig.toml` leaves out the web test preload, whose mock server and DOM take over
`fetch` and `WebSocket`, so no call would reach impd. Bun reads `bunfig.toml` only from the folder
it runs in. From the repo root, Bun loads the web preload, and the suite fails at once with
`the web test preload is loaded`.

Each test creates its own imp and its own secret named `nixie-test-<id>` with a dummy value. A test
refuses a secret name that impd holds already, because the run did not add that secret, and it
removes only a secret it added. When a test ends, fails, or fails part way through setup, it removes
its imps first and its secret after. A run that you stop with Ctrl-C skips that cleanup. Remove what
it left with impd's API: the imps the run created, each named `nixie-<id>`, and each
`nixie-test-<id>` secret.

## The fetch sandbox tests

The imp tests in `apps/server/src/start-web-fetch.test.ts` run the fetch sandbox on the fetch image.
The web fetch tool fetches `https://example.com/`, a fetch sandbox reaches `1.1.1.1` over TCP, and a
direct TCP connection from a fetch sandbox to impd, to each host address and to a tailnet address
fails. The direct connections skip the fetcher's own address check, so only the network layer
decides them. The tests skip unless the variables below are set.

1. Build the fetch image into impd, with the repo root as the build folder:

   ```bash
   imp image build . --file=guests/fetch/Dockerfile --name=<fetch_image_name>
   ```

   impd refuses a `FROM` line that names its image with a variable, so the Dockerfile writes out the
   Bun version from `.bun-version`. When `.bun-version` changes, change both `FROM` lines to match.

2. Run the tests from `apps/server`, whose `bunfig.toml` leaves out the web test preload:

   ```bash
   cd apps/server
   NIXIE_IMP_TEST_URL=<impd_url> \
   NIXIE_IMP_TEST_TOKEN=<impd_token> \
   NIXIE_IMP_TEST_HOST_ADDRESSES=<host_addresses> \
   NIXIE_IMP_TEST_FETCH_IMAGE=<fetch_image_name> \
   bun test src/start-web-fetch.test.ts
   ```

   `NIXIE_IMP_TEST_EGRESS_DENY` takes the list that impd reads from `IMP_EGRESS_DENY`, and
   `NIXIE_IMP_TEST_TAILNET_ADDRESS` replaces the tailnet address probed, `100.100.100.100` by
   default. The test probes that address on port 80, where the tailnet's resolver answers HTTP. imp
   sends every IPv4 packet that a guest sends to port 53 to impd's own resolver, so a connection on
   port 53 succeeds whatever the address, and it shows nothing about whether the sandbox reaches the
   tailnet. A replacement address needs a listener on port 80, because a refused connection passes
   the test whether the network or the peer refused it. The test resolves impd's name on the machine
   that runs it and probes each address, because the guest cannot resolve that name.

Expect `0 fail`, with no skipped test. Each test destroys the imps it created when it ends; a run
that you stop with Ctrl-C leaves them, each named `nixie-<id>`.
