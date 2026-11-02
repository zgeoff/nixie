---
name: project-testing
description:
  "nixie's test facts, the shared testing rules it replaces for the model API lane and the MSW
  server, and its own test topics: the unit run's prerequisites, the live lanes, the test build,
  where a harness lives, the browser lane and the nixie harnesses. Load it beside testing before you
  design, write, run or review a nixie test."
metadata:
  kind: rule-set
---

# nixie testing

## References

- [The browser lane](./references/browser-lane.md): read it before you write, run or debug a
  `*.browser.test.ts` suite.
- [The nixie harnesses](./references/nixie-harnesses.md): read it before you start nixie in a test,
  in process or as a child process, or write a crash suite that arms fault points.

## Facts

| Fact       | Where                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Lanes      | the `lanes` option of the `zgeoff/max-test-timeout` lint rule in [`.oxlintrc.json`](../../../.oxlintrc.json) |
| Test utils | [`libs/testing/src/`](../../../libs/testing/src/)                                                            |

## Departures

- Leave the model API lane, the `*.model-api.test.ts` suites, out of nixie's CI. The
  [Lanes](../testing/references/slow-tests.md#lanes) section of the shared testing skill runs that
  lane nightly and on a labelled pull request, but nixie's CI holds no model credential. The preview
  service in nixie's deployment repo runs the
  [SDK contract suite](../../../evals/sdk-contract/README.md) on each pull request that changes the
  Agent SDK version, and posts the result as the `sdk-contract` commit status.
- Add a package's MSW handlers from that package's test preload, through `addMockHandlers` from
  `@heynixie/mock-server`, as
  [the web client's preload](../../../apps/web/src/mocks/test-preload.ts) does. The shared
  [server and its lifecycle](../testing/references/http.md#the-server-and-its-lifecycle) section
  lists every package's handlers in the MSW server's `handlers` option. In nixie, each package's
  preload adds its handlers after the MSW server starts, and `addMockHandlers` keeps the MSW
  server's catch-all handler after them.
- Send a test's real requests only to a loopback host, a host under the reserved `.test` domain or a
  `data:` URL. The catch-all handler passes those three through, and fails every other unmatched
  request with `Failed to fetch`. The same shared section passes only loopback hosts, but no DNS
  server resolves a `.test` name and a `data:` URL holds its own contents, so neither reaches the
  network. The web fetch guest's suites call test sites under `.test` through a stub resolver, and
  `@impz/testing` loads its wasm module from a `data:` URL.

## The unit run

- Install the Bun version in `.bun-version` before you change a test that asserts on an error Bun
  raises, such as the code of a refused connection. That error can change between Bun releases, so
  the test can fail on another Bun where CI passes.
- Run the unit tests through `bun run test`, never a bare `bun test`. The script first fetches the
  memory encoder's model files and builds the nixie server bundles. A bare `bun test` skips the
  encoder's suites when the model files are missing, and in CI those suites fail instead.
- Read a nixie server bundle in a test through
  [`readTestBundle`](../../../apps/server/src/test-utils/read-test-bundle.ts), never by building
  one. A whole-server build takes seconds and runs a unit test past its limit.
- Add each pattern you add to `pathIgnorePatterns` in [`bunfig.toml`](../../../bunfig.toml) to the
  `test` script as well. A `--path-ignore-patterns` flag replaces the config's list.
- Put each reset of shared state in a preload that [`bunfig.toml`](../../../bunfig.toml) lists,
  never in a helper module. A hook that an imported module registers binds only to the first file
  that imports it.

## The live lanes

- Run the `*.imp.test.ts` suites by hand, as the
  [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) describes. Each needs a
  real impd, the sandbox daemon, on a host with `/dev/kvm`, so CI never runs that lane. The suites
  skip until the runbook's variables are set.
- Test the imp adapter in the unit run on `startTestImpd` from `@impz/testing`. It runs impd's own
  API on stand-ins for the VMs and the host, so the test needs no `/dev/kvm`.
- Give each model API test a limit of about twice its measured time, within the lane's limit,
  because a live model's time varies by test. A test in any other lane sets no limit of its own.

## The test build

- Put test-only code, such as a fault point, the controllable clock, the test rule, the test
  connector or the sandbox double, inside `if (NIXIE_TEST_BUILD) { … }`. The release build defines
  that global as `false`, so the bundler drops the code. The root preloads set it to `true`, so
  every `bun test` run from the repo root is a test build.

## Where a harness lives

- Move a harness to [`libs/testing`](../../../libs/testing/src/) once a second server package needs
  it. That lib is `server-only`, as the [code layout](../../../docs/architecture/code-layout.md)
  defines, so a guest keeps its test helpers in its own package.
- Put a suite that spawns nixie, the web client or a build of either under `e2e/`. Import the
  helpers it shares with the browser suites from
  [`@heynixie/web/test-utils`](../../../apps/web/src/test-utils/index.ts).
