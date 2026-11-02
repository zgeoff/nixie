---
name: project-testing
description:
  nixie's test harness facts — the runs and their gates, the preloads, the test build, and the
  shared harnesses in libs/testing. Load it with the testing skill whenever you design, write, run,
  or review tests in this repo.
---

# nixie test harnesses

nixie's tests run through a few commands, a set of root preloads and the shared harnesses in
`libs/testing`. The shared testing skill holds the rules for writing tests, and nothing here relaxes
them.

## Key rules

Each line links the section that explains it.

- [Runs](#runs): `bun run test` at the root runs the unit run. A lane is a set of suites that needs
  a real system, with a script of its own, and `bun run check` runs the unit run and the lanes that
  CI runs.
- [Preloads](#preloads): the root preloads make every test run a test build, swap in Bun's own
  `FormData`, run one MSW server for every package, and reset the mock server, the web client's
  state and the GitHub mock's store after each test.
- [The test build](#the-test-build): the fault points, test clock, and other test-only code sit
  behind `NIXIE_TEST_BUILD`, which every `bun test` run from the repo root sets.
- [Shared harnesses](#shared-harnesses): a harness more than one server package uses lives in
  `libs/testing`; search it before writing one.

## References

- [The browser lane](./references/browser-lane.md): writing, running or debugging a
  `*.browser.test.ts` suite.
- [The nixie harnesses](./references/nixie-harnesses.md): starting nixie in a server suite, in
  process or as a spawned child process, or writing a crash suite that arms fault points.

## Runs

| Run                    | Command                                                        | Needs                                                                                           |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Unit and package tests | `bun run test` at the root                                     | The Bun that `.bun-version` pins; the imp and SDK contract suites skip                          |
| imp isolation          | `bun run test:imp` in `adapters/sandbox-imp` and `apps/server` | An impd on a host with `/dev/kvm`, and the `NIXIE_IMP_TEST_*` variables                         |
| SDK contract           | `NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract`             | A model credential, or a broker's placeholder, in `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` |

Some tests pin an error that Bun raises, such as the code of a refused connection, and that error
can change between Bun releases, so a test run on another Bun release can fail where CI passes. Run
the Bun that `.bun-version` pins before you change such a test.

The [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) gives that run's
variables and steps. The [SDK contract suite](../../../evals/sdk-contract/README.md) runs the pinned
Agent SDK against the model. The deployment repo's preview service runs it on a pull request that
changes the SDK version, and posts the result as the `sdk-contract` commit status.

The memory encoder's suites run the real model from `node_modules/.cache/nixie-encoder`, which
`bun run models` fills with the pinned model files after checking each one. `bun run test` runs
`bun run models`, and then `bun run test:bundles`, before the unit run,
`bun test --parallel=${TEST_WORKERS:-4} --no-isolate --randomize`. `bun run test:bundles` writes the
server's release and test bundles to `node_modules/.cache/nixie-test-bundles` through
[`createRunTemplate`](../../../libs/testing/src/create-run-template.ts), keyed by a hash of the
sources, and the server's bundle checks read them, so no unit test pays for a build. The unit run
spreads the files over 4 worker processes, the vCPUs of a CI runner, and `TEST_WORKERS` changes the
count. The files in a worker share one global object, so only the preloads' resets stand between one
file and the next. The unit run shuffles the files, and a test that passes only when another file
runs first then fails. A failure prints the test run's `--seed=<n>`; pass that flag to the same
`bun test` command to repeat its order. Plain `bun test` skips the memory encoder's suites when the
model files are missing, and CI, where the `CI` variable is set, fails them instead, so a CI run
never passes without the model. The spikes under `research/` and `docs/design/` run by hand, so the
root [`bunfig.toml`](../../../bunfig.toml) skips them. The unit run's ignore patterns repeat the
root config's, because a pattern given on the command line replaces that list.

Before you write, run or debug a `*.browser.test.ts` suite, read
[the browser lane](./references/browser-lane.md).

Five lanes run suites that need a real system the unit run cannot host. `bun run test` leaves each
lane's files out, and the browser, Agent SDK and e2e lanes' scripts run their files one at a time,
in one test process. The imp and model API lanes run outside CI, on the host or with the credential
that the imp isolation and SDK contract runs need.

| Lane      | Files                 | Real system                                                   | Script           | Limit per test     |
| --------- | --------------------- | ------------------------------------------------------------- | ---------------- | ------------------ |
| browser   | `*.browser.test.ts`   | A headless Chrome or Chromium, through `Bun.WebView`          | `test:browser`   | 10 s               |
| Agent SDK | `*.agent-sdk.test.ts` | The Agent SDK's CLI as a subprocess, against a scripted model | `test:agent-sdk` | 5 s, Bun's default |
| e2e       | every suite in `e2e/` | The built nixie or web client, driven from outside            | `test:e2e`       | 15 s               |
| imp       | `*.imp.test.ts`       | A real impd on a host with `/dev/kvm`                         | `test:imp`       | 14 s               |
| model API | `*.model-api.test.ts` | The live model, through the pinned Agent SDK                  | SDK contract run | 120 s              |

An Agent SDK suite, in a guest or in `evals/test-utils`, never calls the live model; the SDK
contract suite in `evals/sdk-contract` does. A test in a lane sets no limit of its own, and a slow
test gets a fix, never a raised lane limit. A model API test is the one exception: a live model's
time varies by test, so each sets a limit of about twice its measured time, within the lane's. CI's
[test timeouts check](../../../scripts/run-test-timeouts-check.ts) lets only a lane script raise the
limit. CI runs the browser, Agent SDK and e2e lanes' scripts, each as a check of its own. The
pre-push hook runs no lane: its test job runs, through `bun run test`, only the unit tests beside
the files the branch changes.

A suite that spawns nixie, the web client or a build of either lives under `e2e/`. It imports the
helpers it shares with the browser suites from
[`@heynixie/web/test-utils`](../../../apps/web/src/test-utils/index.ts).

## Preloads

Every test script passes `--no-isolate`, because a fresh global object for each file costs time and
memory, and isolation hides a leak between files.

A preload's body runs once for each worker, and Bun runs its `beforeAll` and `afterAll` once for
each worker too. One exception: under `--parallel=N --no-isolate` with N of 2 or more, Bun runs
those hooks around each file. So a preload pairs every start in `beforeAll` with its stop in
`afterAll`, and never starts at the top level. A hook that an imported module registers binds only
to the first file that imports it, so a reset lives in a preload, never in a helper module.

The root [`bunfig.toml`](../../../bunfig.toml) preloads, in order:

1. [`define-test-build.ts`](../../../libs/testing/src/define-test-build.ts), which sets the global
   `NIXIE_TEST_BUILD` to `true`.
2. [`set-test-tmpdir.ts`](../../../libs/testing/src/set-test-tmpdir.ts), which points `TMPDIR` at
   `/dev/shm` when that is a tmpfs with room that allows executables, so a test's SQLite commits
   never wait on a busy disk's fsync.
3. `@zgeoff/bun-test-extended`, for the jest-extended matchers.
4. `@zgeoff/bun-test-react`, for happy-dom and the Testing Library matchers.
5. [`restore-native-form-data.ts`](../../../libs/testing/src/restore-native-form-data.ts), which
   puts Bun's own `File` and `FormData` back in place of happy-dom's, because Bun's fetch cannot
   send happy-dom's as a multipart body.
6. [`restore-native-base64.ts`](../../../libs/testing/src/restore-native-base64.ts), which puts
   Bun's own `atob` and `btoa` back in place of happy-dom's script versions, because zod's base64
   check calls `atob` on every image a frame carries.
7. [`start-mock-server.ts`](../../../libs/mock-server/src/start-mock-server.ts), which runs the one
   MSW server of the process and resets its handlers after each test.
8. The web client's [`test-preload.ts`](../../../apps/web/src/mocks/test-preload.ts), which seeds
   faker, points happy-dom at the web origin, sets an in-memory IndexedDB from fake-indexeddb, and
   adds the web client's handlers to the MSW server. After each test it resets the mock store, the
   browser cookies, `localStorage`, IndexedDB, the system's light or dark setting and the document's
   theme attribute.
9. The GitHub mock's
   [`test-preload.ts`](../../../adapters/definitions-github/src/mocks/test-preload.ts), which adds
   the mock GitHub API's handlers and resets its store after each test.

A package adds its handlers with `addMockHandlers` from `@heynixie/mock-server` and never starts an
MSW server of its own: a second server attaches to the first one's fetch interceptor, so both read
each request's body, and the first one's close stops the second. The MSW server's last handler,
which `addMockHandlers` keeps last, lets through an unmatched request to a loopback host, to a host
under the reserved `.test` domain or to a `data:` URL. It refuses every other unmatched request, so
that `fetch` fails with `Failed to fetch` and never reaches the network. The web server suites call
stub APIs on loopback ports, the fetcher's suites call test sites under `.test`, and `@impz/testing`
loads its wasm module from a `data:` URL.

## The test build

The fault points, the controllable clock, the test rule, the test connector and the sandbox double
sit behind `NIXIE_TEST_BUILD`. The release build defines it as `false`, so the bundler drops them,
and the root preloads make every `bun test` run from the repo root a test build.

## Shared harnesses

[`libs/testing`](../../../libs/testing/src/) (`@heynixie/testing`) holds the harnesses that more
than one package uses, such as the crash harness, the scripted model, the test clock, and the
condition wait. Each sits in a file named for its export with its own test beside it, and
[its index](../../../libs/testing/src/index.ts) lists the exports, so search there before writing a
harness. It is server-only, so a guest keeps its test helpers in its own package.

Each package keeps the helpers only its own tests use in `src/test-utils/`, each with its own test
file. When a helper takes the data that sets up one test, the test calls it in the test's own body.
`setupTest()` may wrap a helper that takes no arguments.
[`startTestSite`](../../../guests/fetch/src/test-utils/start-test-site.ts) takes the scenario, its
certificate names and response handler, so a test calls it in its body.
[`startFakeImp`](../../../adapters/sandbox-imp/src/test-utils/start-fake-imp.ts) takes none, so
`setupTest()` may wrap it.

A test of the imp port can run a real impd in the test process through `startTestImpd` from
`@impz/testing`, which impz publishes with each `@impz/client` release. That impd runs its own API
and lifecycle on stand-ins for the VMs and the host, so the test needs no `/dev/kvm` and runs in the
unit run.

Before you start nixie in a test, in process or as a child process, read
[the nixie harnesses](./references/nixie-harnesses.md).
