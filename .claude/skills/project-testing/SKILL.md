---
name: project-testing
description:
  "nixie's test facts, the shared testing rules it replaces for the model API lane and the MSW
  server, and its own test topics: the unit tests' prerequisites, the imp and model API lanes, the
  test build, where a harness lives, the browser lane, the e2e, bundle, journeys and restic lanes
  and the nixie harnesses. Load it beside testing before you design, write, run or review a nixie
  test."
metadata:
  kind: rule-set
---

# nixie testing

## References

- [The browser lane](./references/browser-lane.md): read it before you write, run or debug a
  `*.browser.test.ts` suite.
- [The e2e, bundle, journeys and restic lanes](./references/e2e-and-restic-lanes.md): read it before
  you write, run or debug a suite under `e2e/`, including a `*.restic.test.ts` suite and a journey
  in `e2e/journeys/`, or a `*.bundle.test.ts` suite.
- [The nixie harnesses](./references/nixie-harnesses.md): read it before you start nixie in a test,
  in process or as a child process, or write a crash suite that arms fault points.
- [Agent SDK probes](./references/agent-sdk-probes.md): read it before you write a check of an SDK
  behaviour nixie relies on.

## Facts

| Fact       | Where                                                                                                                                                                                                                                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lanes      | [`rig.config.ts`](../../../rig.config.ts) for the lanes nixie adds or changes, and their limits; the table in the testing skill's [Lanes](../testing/references/slow-tests.md#lanes) for every other lane, the model-api lane included; the `test:e2e` script in the root [`package.json`](../../../package.json), whose `--timeout` sets the e2e lane's limit |
| Test utils | [`libs/testing/src/`](../../../libs/testing/src/) for a harness that 2 server packages share; otherwise the `src/test-utils/` folder of the package that owns what the helper starts, builds or fakes. A server package is any package the nixie server runs: the server app, a module, an adapter or a lib                                                    |

## Departures

- Run the `*.model-api.test.ts` files by hand, never in CI. This replaces the rule in
  [Lanes](../testing/references/slow-tests.md#lanes) to run the `model-api` lane nightly and on an
  SDK bump, because nixie's CI holds no model credential. The files form the
  [SDK contract suite](../../../docs/architecture/core/sdk-contract-suite.md), and the Agent SDK
  bump rule in [AGENTS.md](../../../AGENTS.md) says when to run it and where its output goes.
- Build no MSW server of your own. The shared rule in
  [The server and its lifecycle](../testing/references/http.md#the-server-and-its-lifecycle) has
  each test process build one, and nixie's packages share one process from the repo root, so
  `@heynixie/mock-server` builds the one server for all of them.
  - Add a package's handlers with
    [`addMockHandlers`](../../../libs/mock-server/src/add-mock-handlers.ts), in the package's
    `src/mocks/test-preload.ts`. When the package has no preload, write one, as
    [the web client's preload](../../../apps/web/src/mocks/test-preload.ts) does, and list it in the
    root [`bunfig.toml`](../../../bunfig.toml).
  - After each test, `@heynixie/mock-server` resets the handlers to those that `addMockHandlers`
    added. For one test's handler, call `mockServer.use(...)`, as
    [Per-test handlers](../testing/references/http.md#per-test-handlers) says.
- Pass no `onUnhandledFrame` callback. This replaces the callback in
  [The server and its lifecycle](../testing/references/http.md#the-server-and-its-lifecycle),
  because under Bun, MSW's unhandled-request error never stops a request. `@heynixie/mock-server`
  ends its handler list with a catch-all handler instead. That handler fails each request that no
  other handler matches with `Failed to fetch`, and passes these through:
  - a request to a loopback host;
  - a `data:` URL, which holds its own contents;
  - a request to a host under the reserved `.test` domain, for code that takes a resolver. No DNS
    server answers a `.test` name, so without a stub resolver the request fails at its lookup. The
    web fetch guest's suites pass one from
    [`buildStubResolver`](../../../guests/fetch/src/test-utils/build-stub-resolver.ts).

  Point a test's unmatched requests at a loopback host, unless the code under test takes a resolver.

## Test commands

Before you call a test done, run it with its command from this table. Use the first row whose files
match the test file. The test runner `@zgeoff/rig`, called rig, runs every command but `test:e2e`,
whose script runs `bun test` itself.

| Files                                                                                              | Command                                       | In CI             |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| `*.browser.test.ts` outside `e2e/journeys/` and `e2e/src/`                                         | `bun run test:browser`                        | in `pr.yml`       |
| `*.agent-sdk.test.ts`                                                                              | `bun run test:agent-sdk`                      | in `pr.yml`       |
| `e2e/**`, except `*.browser.test.ts` and `*.restic.test.ts`                                        | `bun run test:e2e`                            | in `pr.yml`       |
| `*.browser.test.ts` in `e2e/journeys/`, and `e2e/src/test-utils/start-web-journey.browser.test.ts` | `bun run test:journeys`                       | in `journeys.yml` |
| `*.bundle.test.ts` outside `e2e/`                                                                  | `bun run test:bundle`                         | in `pr.yml`       |
| `e2e/**/*.restic.test.ts`                                                                          | `bun run test:restic`                         | in `images.yml`   |
| `*.imp.test.ts`                                                                                    | `bun run test:imp`                            | no                |
| `*.model-api.test.ts`                                                                              | `NIXIE_SDK_CONTRACT=1 bun run test:model-api` | no                |
| every other `*.test.ts`: the unit tests                                                            | `bun run test`                                | in `pr.yml`       |

- Run the unit tests through `bun run test`. It first runs `bun run models`, which fetches the
  memory encoder's model files, and `bun run test:bundles`, which builds nixie's test bundle and its
  release bundle. To test one file, run those 2 commands once, then `bun test <path>` from the repo
  root. Without `bun run models`, a bare `bun test` skips the memory encoder's suites. Without
  `bun run test:bundles`, a test builds a missing bundle itself and runs past its limit. Run
  `bun run test:bundles` again after you change a server package, as the Test utils fact defines
  one.
- To test one file of a lane, pass the file's path to the lane's command, such as
  `bun run test:agent-sdk <path>`. rig runs only the lane's own files among the paths you pass.
  Never test a lane's file with a bare `bun test`. A bare `bun test` gives the file the unit limit,
  and skips the start hook that rig runs before the Agent SDK, bundle and restic lanes to make the
  builds their tests read.
- To test one e2e file, run the commands of the `test:e2e` script up to its `bun test`. Then run
  that `bun test` with the file's path in place of `e2e/`. `bun run test:e2e` passes a path you add
  only to its last command.
- To test one journey, run `bun run test:journeys --test-name-pattern='<test name>'`. The script
  passes rig the path of every journey, so a path you add narrows nothing.
- Put a browser suite under `e2e/` in `e2e/journeys/`. The browser lane leaves out `e2e/src/`, and
  the journeys lane runs only the start-web-journey suite there.
- Run the `*.imp.test.ts` suites by hand, as the
  [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) describes. Each needs a
  real impd, nixie's sandbox daemon, which runs each sandbox in a VM called an
  [imp](../../../docs/glossary.md), on a host with `/dev/kvm`. The suites skip until the runbook's
  variables are set, and a suite that skips does not count as passed.
- Keep a `*.imp.test.ts` suite for what only a real impd shows, such as an imp that reaches the
  model host through the broker. Test every other case of the imp adapter in the unit tests, on
  `startTestImpd` from `@impz/testing`. It runs impd's own API on stand-ins for the VMs and the
  host, so the test does not need `/dev/kvm`.
- Set `NIXIE_SDK_CONTRACT=1` when you test the model API files. Without it, every model API test
  skips, and the command passes with no test run.
- Set no time limit in a test. rig gives each test its lane's limit, and a raised limit only hides a
  slow test. The `zgeoff/max-test-timeout` lint rule fails a limit above the lane's.
- Give a model API test a limit of its own, because a live model's time varies by test. Measure the
  test's time in an imp, with the steps in the
  [SDK contract suite runbook](../../../docs/runbooks/sdk-contract-suite.md). Then pass about twice
  that time as the third argument to `test()`, within the model-api lane's limit.
- Install the Bun version in `.bun-version` before you change a test that asserts on an error Bun
  raises, such as the code of a refused connection. That error can change between Bun releases.
- When you add a pattern to `pathIgnorePatterns` in the root `bunfig.toml`, add it to the `ignore`
  list in `rig.config.ts` as well. rig passes each lane its patterns as flags, and a
  `--path-ignore-patterns` flag replaces the bunfig's list.
- Read nixie's test bundle or its release bundle in a unit test through
  [`readTestBundle`](../../../apps/server/src/test-utils/read-test-bundle.ts), never by building
  one. A whole-server build takes seconds.

## Sockets and shared state

- Open a `WebSocket` in a test only to a loopback host. `@heynixie/mock-server` passes those sockets
  through with a handler of their own.
- Register a reset of shared state, such as an `afterEach`, in the package's test preload that the
  root `bunfig.toml` lists. A hook that an imported helper module registers binds only to the first
  file that imports it. Leave the MSW handlers out: `@heynixie/mock-server` resets them.

## The test build

- Put test-only code that a product file holds inside `if (NIXIE_TEST_BUILD) { … }`.
  `NIXIE_TEST_BUILD` is a global boolean constant, which
  [`nixie-test-build.d.ts`](../../../nixie-test-build.d.ts) declares. The root preloads set it to
  `true` for every `bun test` from the repo root, and nixie's test bundle sets it at build time. Its
  release bundle sets it to `false`, so the bundler drops the code behind it.
  [Crash tests](../../../docs/architecture/core/crash-tests.md) lists the code that sits behind it.
- Leave code that only test files import without the guard.

## Where a harness lives

- Search [`libs/testing/src/`](../../../libs/testing/src/) before you write a harness. Move a
  harness there from its package's `src/test-utils/` once a second server package needs it.
- Import the harness that spawns nixie in an `e2e/` suite from
  [`@heynixie/server/test-utils`](../../../apps/server/src/test-utils/index.ts), and the helpers
  that an `e2e/` suite shares with the browser suites from
  [`@heynixie/web/test-utils`](../../../apps/web/src/test-utils/index.ts).
- Put a helper that only `e2e/` suites share, such as one that 2 journeys call, in
  [`e2e/src/test-utils/`](../../../e2e/src/test-utils/), with its own test beside it.
