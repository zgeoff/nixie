---
name: project-testing
description:
  "nixie's test facts, the shared testing rules it replaces for the model API lane and the MSW
  server, and its own test topics: the MSW server, the unit tests' prerequisites, the imp and model
  API lanes, time limits, the test build, where e2e code lives, the browser lane, the e2e, bundle,
  journeys and restic lanes and the nixie harnesses. Load it beside testing before you design,
  write, run or review a nixie test."
metadata:
  kind: rule-set
---

# nixie testing

## References

- [The browser lane](./references/browser-lane.md): read it before you write, run or debug a
  `*.browser.test.ts` suite.
- [The e2e, bundle, journeys and restic lanes](./references/e2e-and-restic-lanes.md): read it before
  you write, run or debug a suite in an app's `e2e/` folder, including a `*.restic.test.ts` suite
  and a journey, or a `*.bundle.test.ts` suite.
- [The nixie harnesses](./references/nixie-harnesses.md): read it before you start nixie in a test,
  in process or as a child process, or write a crash suite that arms fault points.
- [Agent SDK probes](./references/agent-sdk-probes.md): read it before you write a check of an SDK
  behaviour nixie relies on.

## Facts

| Fact          | Where                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test commands | the `test:*` scripts in the root [`package.json`](../../../package.json); `lanes` in [`rig.config.ts`](../../../rig.config.ts) for each lane nixie adds or changes, with its limit. Every other lane keeps its limit from the testing skill's [slow tests reference](../testing/references/slow-tests.md) |
| Test utils    | [`libs/testing/src/`](../../../libs/testing/src/) for a helper that 2 server packages share; otherwise `src/test-utils/` in the package that owns what the helper starts, builds or fakes                                                                                                                 |

Count as a server package any package the nixie server runs: the server app, a module, an adapter or
a lib.

## Departures

- Run the `*.model-api.test.ts` files by hand. CI never runs them: nixie's CI holds no model
  credential. This replaces the rule in
  [Where each test runs](../testing/references/slow-tests.md#where-each-test-runs) to run the
  `model-api` lane nightly and on an SDK bump. For when to run them and where their output goes,
  read the Agent SDK bump rule in [AGENTS.md](../../../AGENTS.md).
- Never build an MSW server of your own. A `bun test` from the repo root runs every package's tests
  in one process, and `@heynixie/mock-server` builds one test network for all of them, with
  `createTestNetwork` from `@zgeoff/testing/fetch`, from a preload in the root
  [`bunfig.toml`](../../../bunfig.toml). Expect the network to reject each request that no handler
  matches and to fail the test in `afterEach`. A request to a loopback host goes to Bun's own
  `fetch`.

## The MSW server

- Answer a request to an outside API with an MSW handler. Add a package's default handlers with
  [`addMockHandlers`](../../../libs/mock-server/src/add-mock-handlers.ts), in the package's
  `src/mocks/test-preload.ts`. When the package has no preload, write one, as
  [the web client's preload](../../../apps/web/src/mocks/test-preload.ts) does, and add it at the
  end of the `preload` list in the root `bunfig.toml`.
- Give each handler a URL that no other package's handler matches. Of 2 matching handlers, the one
  whose preload comes first in `bunfig.toml` wins.
- For one test's handler, call `network.use(...)`, as
  [Per-test handlers](../testing/references/http.md#per-test-handlers) says. After each test,
  `@heynixie/mock-server` resets the handlers to those that `addMockHandlers` added.
- When the code under test takes a resolver for host names, as the code in `guests/fetch/` does, use
  a `.test` host. Map it to a loopback address with
  [`buildStubResolver`](../../../guests/fetch/src/test-utils/build-stub-resolver.ts), and serve the
  request from a loopback server.
- Open a `WebSocket` in a test only to a loopback host. `@heynixie/mock-server` passes those sockets
  through.

## Test commands

Before you call a test done, run it with its command from this table. Use the first row whose files
match the test file.

| Files                                                                                                               | Command                                       | In CI             |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------- |
| `*.browser.test.ts` outside `apps/server/e2e/`, except `start-web-journey.browser.test.ts`                          | `bun run test:browser`                        | in `pr.yml`       |
| `*.agent-sdk.test.ts`                                                                                               | `bun run test:agent-sdk`                      | in `pr.yml`       |
| `apps/*/e2e/**`, except `*.browser.test.ts` and `*.restic.test.ts`                                                  | `bun run test:e2e`                            | in `pr.yml`       |
| `*.browser.test.ts` in `apps/server/e2e/`, and `start-web-journey.browser.test.ts` in `apps/server/src/test-utils/` | `bun run test:journeys`                       | in `journeys.yml` |
| `*.bundle.test.ts` outside `e2e/`                                                                                   | `bun run test:bundle`                         | in `pr.yml`       |
| `*.restic.test.ts` in `apps/*/e2e/`                                                                                 | `bun run test:restic`                         | in `images.yml`   |
| `*.imp.test.ts`                                                                                                     | `bun run test:imp`                            | no                |
| `*.model-api.test.ts`                                                                                               | `NIXIE_SDK_CONTRACT=1 bun run test:model-api` | no                |
| every other `*.test.ts`: the unit tests                                                                             | `bun run test`                                | in `pr.yml`       |

### One unit test file

`bun run test` runs 3 commands before the unit tests. Before you run `bun test <path>` on one unit
test file, run each one that the file needs, from the repo root:

- Run `bun run models` to fetch the memory encoder's model files, for a file in
  `adapters/encoder-onnx/` or one that loads the encoder. Without them, `bun test` skips the
  encoder's suites, and a skipped suite has not passed.
- Run `bun run test:bundles` to build nixie's test and release bundles when the file reads a bundle
  through [`readTestBundle`](../../../apps/server/src/test-utils/read-test-bundle.ts), and again
  after each change to a server package. A test that finds no bundle builds one, and runs past its
  limit.
- Run `bun run test:templates` to build the migrated-data template when the file starts the
  in-process harness, and again after a change under `libs/db/src/` or `modules/log/src/`, as
  [the in-process harness](./references/nixie-harnesses.md#the-in-process-harness) explains.

### One file of another lane

- Pass the file's path to the lane's command, such as `bun run test:agent-sdk <path>`. The test
  runner `@zgeoff/rig`, called rig, runs only the lane's own files among the paths you pass. Never
  run such a file with a bare `bun test`. That gives the file the unit lane's limit, and skips the
  start hook that builds what the bundle, restic and Agent SDK lanes read.
- For one file under `e2e/`, follow
  [The e2e, bundle, journeys and restic lanes](./references/e2e-and-restic-lanes.md).

### Lanes that need a real system

- Run the `*.imp.test.ts` suites by hand, with the
  [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md). Each needs a real impd,
  the daemon that runs each sandbox in a VM called an [imp](../../../docs/glossary.md), on a host
  with `/dev/kvm`. The suites skip until the runbook's variables are set. A suite that skips has not
  passed.
- Keep a `*.imp.test.ts` suite for what only a real impd shows, such as an imp that reaches the
  model host through the broker. Test every other case of the imp adapter in the unit tests, on
  `startTestImpd` from `@impz/testing`, which needs no `/dev/kvm`.
- Run the model API tests inside an imp, with the steps in the
  [SDK contract suite runbook](../../../docs/runbooks/sdk-contract-suite.md). Outside an imp they
  fail: only the imp's broker supplies the model credential. To run one file, add its path to the
  table's command. Without `NIXIE_SDK_CONTRACT=1`, every test skips and the command passes with no
  test run.

## Time limits

- Never set a time limit in a test. rig gives each test its lane's limit, and a raised limit only
  hides a slow test. The `zgeoff/max-test-timeout` lint rule fails a limit above the lane's.
- Give each model API test a limit of its own: the one exception. A live model's time varies by
  test. Time each one in an imp, and pass about twice that time as the third argument to `test()`,
  within the model-api lane's limit.

## Other test setup

- Before you change a test that asserts on an error Bun raises, install the Bun version in
  `.bun-version`. Such an error, like a refused connection's code, can change between Bun releases.
- When you add a pattern to `pathIgnorePatterns` in the root `bunfig.toml`, add it to the `ignore`
  list in `rig.config.ts` too. rig passes each lane its patterns as flags, and a
  `--path-ignore-patterns` flag replaces the bunfig's list.
- Read nixie's test or release bundle in a unit test through `readTestBundle`. Never build one in
  the test: a whole-server build takes seconds.
- Register a reset of shared state, such as an `afterEach`, in a preload file that the root
  `bunfig.toml` lists. A hook that an imported helper module registers binds only to the first file
  that imports it. Put a reset of one package's state in that package's `src/mocks/test-preload.ts`.
  Put a reset that several packages need in a new file in `libs/testing/src/`, and list that file.
  Leave the MSW handlers out: `@heynixie/mock-server` resets them.

## The test build

- Put test-only code that a product file holds inside `if (NIXIE_TEST_BUILD) { … }`.
  `NIXIE_TEST_BUILD` is a global boolean constant, which
  [`nixie-test-build.d.ts`](../../../nixie-test-build.d.ts) declares.
  [`define-test-build.ts`](../../../libs/testing/src/define-test-build.ts), a preload in the root
  `bunfig.toml`, sets it to `true` for every `bun test` from the repo root, and nixie's test bundle
  sets it at build time. Its release bundle sets it to `false`, so the bundler drops the guarded
  code. [Crash tests](../../../docs/architecture/core/crash-tests.md) lists that code.
- Leave code that only test files import without the guard.

## Where e2e code lives

- Put each `e2e/` suite in the folder of the app it starts, with a prefix from the testing skill's
  [E2e prefixes](../testing/references/system-tests.md#e2e-prefixes). `rig.config.ts` declares each
  app's program under `programs`.
- Start the web client and the backup job from `resolveProgram` in `@zgeoff/rig/e2e`, and nixie with
  [`startE2ENixie`](../../../apps/server/src/test-utils/start-e2e-nixie.ts) from
  `@heynixie/server/test-utils`.
- Put a helper that `e2e/` suites share in `src/test-utils/` of the package that owns what it
  starts, with its own test beside it, such as
  [`start-web-journey.ts`](../../../apps/server/src/test-utils/start-web-journey.ts).
- Put each browser suite of `e2e/` in `apps/server/e2e/`, named `journey-<name>.browser.test.ts`.
