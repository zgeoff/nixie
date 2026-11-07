---
name: project-testing
description:
  "nixie's test facts, the shared testing rules it replaces for the model API lane and the MSW
  server, and its own test topics: the unit run's prerequisites, the live lanes, the test build,
  where a harness lives, the browser lane, the e2e, journeys and restic lanes and the nixie
  harnesses. Load it beside testing before you design, write, run or review a nixie test."
metadata:
  kind: rule-set
---

# nixie testing

## References

- [The browser lane](./references/browser-lane.md): read it before you write, run or debug a
  `*.browser.test.ts` suite.
- [The e2e, journeys and restic lanes](./references/e2e-and-restic-lanes.md): read it before you
  write, run or debug a suite under `e2e/`, including a `*.restic.test.ts` suite and a journey in
  `e2e/journeys/`.
- [The nixie harnesses](./references/nixie-harnesses.md): read it before you start nixie in a test,
  in process or as a child process, or write a crash suite that arms fault points.

## Test commands

Follow the shared `testing` skill, with the departures and additions below. Before you call a test
done, run it with its command from this table. Find the row by the file's suffix or folder. A file
that matches no other row belongs to the unit run. Each other row is a lane, with its own command
and its own limit per test.

| Files                                                                    | Command                                            | Limit per test | In CI             |
| ------------------------------------------------------------------------ | -------------------------------------------------- | -------------- | ----------------- |
| any other `*.test.ts`                                                    | `bun run test`                                     | 5 s            | in `pr.yml`       |
| `*.browser.test.ts`                                                      | `bun run test:browser`                             | 10 s           | in `pr.yml`       |
| `*.agent-sdk.test.ts`                                                    | `bun run test:agent-sdk`                           | 5 s            | in `pr.yml`       |
| `e2e/**`, except the journeys and the restic suites                      | `bun run test:e2e`                                 | 15 s           | in `pr.yml`       |
| `e2e/journeys/*.test.ts`, `e2e/src/test-utils/start-web-journey.test.ts` | `bun run test:journeys`                            | 15 s           | in `journeys.yml` |
| `*.e2e.test.ts` outside `e2e/`                                           | `bun run test:e2e`                                 | 15 s           | in `pr.yml`       |
| `e2e/**/*.restic.test.ts`                                                | `bun run test:restic`                              | 40 s           | in `images.yml`   |
| `*.imp.test.ts`                                                          | `bun run test:imp` in the package                  | 14 s           | no                |
| `*.model-api.test.ts`                                                    | `NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract` | 120 s          | no                |

- Run the unit tests through `bun run test`. It first runs `bun run models`, which fetches the
  memory encoder's model files, and `bun run test:bundles`, which builds nixie's test bundle and its
  release bundle. To test one file, run those 2 commands, then `bun test <path>`.
- Never run a bare `bun test` with neither command before it. Without `bun run models`, it skips the
  memory encoder's suites. Without `bun run test:bundles`, a test builds a missing bundle itself and
  runs past its limit. Run `bun run test:bundles` again after you change server code.
- Test one `*.agent-sdk.test.ts` file with `bun test --parallel=1 --no-isolate <path>`. Its lane
  builds nothing first.
- Run the `*.imp.test.ts` suites by hand, as the
  [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) describes. Each needs a
  real impd, the daemon that runs nixie's sandboxes, on a host with `/dev/kvm`. They skip until the
  runbook's variables are set, and a suite that skips does not count as run.
- Keep a `*.imp.test.ts` suite for what only a real impd shows, such as an imp that reaches the
  model host through the broker. Test every other case of the imp adapter in the unit run, on
  `startTestImpd` from `@impz/testing`. It runs impd's own API on stand-ins for the VMs and the
  host. The test needs no `/dev/kvm`.
- Set no time limit in a test. One exception: give a model API test about twice its time measured on
  an [imp](../../../docs/glossary.md), within its lane's limit, with the steps in the
  [SDK contract suite runbook](../../../docs/runbooks/sdk-contract-suite.md). Measure it on an imp,
  where you run the suite by hand. A live model's time varies by test.
- Install the Bun version in `.bun-version` before you change a test that asserts on an error Bun
  raises, such as the code of a refused connection. That error can change between Bun releases.
- Add each pattern you add to `pathIgnorePatterns` in the root `bunfig.toml` to the root
  `package.json` `test` script as well. A `--path-ignore-patterns` flag replaces the config's list.
- Read nixie's test bundle or its release bundle in a unit test through
  [`readTestBundle`](../../../apps/server/src/test-utils/read-test-bundle.ts), never by building
  one. A whole-server build takes seconds. To start nixie as a process, call `startSpawnedNixie`,
  which reads the test bundle through `readTestBundle`.

## Departures from the shared skill

nixie replaces these rules of the shared `testing` skill.

- In place of the shared rule to run the `model-api` lane nightly and on an SDK bump, never run the
  `*.model-api.test.ts` files in CI. They form the
  [SDK contract suite](../../../evals/sdk-contract/README.md), and nixie's CI holds no model
  credential. A preview service in nixie's private deployment repo runs the suite on each pull
  request that changes the Agent SDK version, and posts the outcome as the `sdk-contract` commit
  status. Run the suite by hand on that pull request as well, with the steps in the
  [SDK contract suite runbook](../../../docs/runbooks/sdk-contract-suite.md), and post its output in
  a comment. The status carries no output, and the Agent SDK bump rule in
  [AGENTS.md](../../../AGENTS.md) needs that comment before the merge.
- In place of the shared MSW setup in each package's preload, add a package's MSW handlers through
  [`addMockHandlers`](../../../libs/mock-server/src/add-mock-handlers.ts) from
  `@heynixie/mock-server`, in a test preload of the package. List that preload in the root
  [`bunfig.toml`](../../../bunfig.toml), as
  [the web client's preload](../../../apps/web/src/mocks/test-preload.ts) does.
  `@heynixie/mock-server` builds the one MSW server with only its catch-all handler, and
  `addMockHandlers` keeps that handler last.
- In place of the shared callback for unhandled requests, send a test's real requests only to a
  loopback host, a host under the reserved `.test` domain or a `data:` URL. The catch-all handler
  passes those through, and fails every other unmatched request with `Failed to fetch`. A `.test`
  name resolves through no DNS server, and a `data:` URL holds its own contents, so neither reaches
  the network. The web fetch guest's suites reach `.test` sites through
  [`buildStubResolver`](../../../guests/fetch/src/test-utils/build-stub-resolver.ts).

## Sockets and shared state

- Open a `WebSocket` in a test only to a loopback host. A second handler in `@heynixie/mock-server`
  passes those sockets through, such as the one the imp adapter opens to a test impd.
- Register a reset of shared state, such as an `afterEach`, in the package's test preload that the
  root `bunfig.toml` lists. A hook that an imported helper module registers binds only to the first
  file that imports it.

## The test build

- Put test-only code that a product file holds inside `if (NIXIE_TEST_BUILD) { … }`. The root
  preloads set `NIXIE_TEST_BUILD` to `true` for every `bun test` from the repo root, and nixie's
  test bundle sets it at build time. Its release bundle sets it to `false`, so the bundler drops the
  code behind it. [Crash tests](../../../docs/architecture/core/crash-tests.md) lists the code that
  sits behind it.
- Leave code that only test files import without the guard.

## Where a harness lives

- Move a harness to [`libs/testing/src/`](../../../libs/testing/src/) once a second server package
  needs it, and search there before you write one. A server package is any package the nixie server
  runs: the server app, a module, an adapter or a lib.
- Import the harness that spawns nixie in an `e2e/` suite from
  [`@heynixie/server/test-utils`](../../../apps/server/src/test-utils/index.ts), and the helpers
  that an `e2e/` suite shares with the browser suites from
  [`@heynixie/web/test-utils`](../../../apps/web/src/test-utils/index.ts).
- Put a helper that only `e2e/` suites share, such as one that 2 journeys call, in
  [`e2e/src/test-utils/`](../../../e2e/src/test-utils/), with its own test beside it.
- Write an Agent SDK probe, one query that checks one SDK behaviour nixie relies on, as a function
  in the conversation guest's
  [`sdk-contract`](../../../guests/conversation/src/sdk-contract/index.ts) folder. A
  `*.agent-sdk.test.ts` suite runs it against the guest's
  [stub model](../../../guests/conversation/src/test-utils/start-stub-model.ts), and the SDK
  contract suite runs it against the live model.
