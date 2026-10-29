---
name: project-testing
description:
  nixie's test harness facts — the runs and their gates, the preloads, the test build, and the
  shared harnesses in libs/testing. Load it with the testing skill whenever you design, write, run,
  or review tests in this repo.
---

# nixie test harnesses

This skill holds the runs, preloads, and harnesses particular to this repo, the variables that drive
them, and where to find them. It describes the code as it is. The rules for writing tests live in
the shared testing skill, and nothing here relaxes them.

## Key rules

Each line links the section that explains it.

- [Runs](#runs): `bun run test` at the root runs the unit run, each lane runs through its own
  script, and `bun run check` runs both; the gated suites need their own host or credential.
- [Preloads](#preloads): the root preloads make every run a test build, swap in Bun's own
  `FormData`, run one MSW server for every package, and reset each package's state after each test.
- [The test build](#the-test-build): the fault points, test clock, and other test-only code sit
  behind `NIXIE_TEST_BUILD`, which every `bun run test` run sets.
- [Shared harnesses](#shared-harnesses): a harness more than one server package uses lives in
  `libs/testing`; search it before writing one.

## Runs

| Run                    | Command                                                        | Needs                                                                                           |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Unit and package tests | `bun run test` at the root                                     | The Bun that `.bun-version` pins; the gated suites below skip                                   |
| imp isolation          | `bun run test:imp` in `adapters/sandbox-imp` and `apps/server` | An impd on a host with `/dev/kvm`, and the `NIXIE_IMP_TEST_*` variables                         |
| SDK contract           | `NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract`             | A model credential, or a broker's placeholder, in `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` |

Some tests pin an error that Bun raises, such as the code of a refused connection, and that error
can change between Bun releases, so a run on another Bun can fail where CI passes.

The [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) gives that run's
variables and steps. The [SDK contract suite](../../../evals/sdk-contract/README.md) runs the pinned
Agent SDK against the model. The deployment repo's preview service runs it on a pull request that
changes the SDK version, and posts the result as the `sdk-contract` commit status.

The memory encoder's suites run the real model from `node_modules/.cache/nixie-encoder`, which
`bun run models` fills with the pinned model files after checking each one. `bun run test` runs it,
and then `bun run test:bundles`, before the unit run,
`bun test --parallel=${TEST_WORKERS:-4} --no-isolate --randomize`. `bun run test:bundles` writes the
server's release and test bundles to `node_modules/.cache/nixie-test-bundles` through
`createRunTemplate`, keyed by a hash of the sources, and the server's bundle checks read them, so no
unit test pays for a build. The e2e lane's script runs `bun run test:bundles` too, then
`bun run test:web-build` and `bun run test:backup-job-build`, which write the web client's build and
the backup job's bundle to the same folder. Every spawned nixie starts from the test bundle, because
a start from source transpiles the whole server, and the web suites read the web build, which takes
longer than a test's limit on a host with 2 cores. Every suite that runs the backup job runs its
bundle, as the image does, and the restic lane's script builds that bundle first too.

The unit run spreads the files over 4 worker processes, the vCPUs of a CI runner, and `TEST_WORKERS`
changes the count. The files in a worker share one global object, so only the preloads' resets stand
between one file and the next, and the run shuffles the files so a test that passes only after
another file fails. A failure prints the run's `--seed=<n>`; run again with that flag to repeat its
order. Plain `bun test` skips those suites when the files are missing, and CI, where the `CI`
variable is set, fails them instead, so a run there never passes without the model. The spikes under
`research/` and `docs/design/` run by hand, so the root [`bunfig.toml`](../../../bunfig.toml) skips
them.

The web app's browser suites, the `*.browser.test.ts` files, drive a headless Chrome or Chromium
through `Bun.WebView`, so `bun test` needs one that Bun finds on `PATH`, in a standard install
location, or at `BUN_CHROME_PATH`. GitHub's Ubuntu runners ship Chrome. `bun run test` leaves the
browser suites out of the parallel run, and `test:browser`, the browser lane, runs them. The
parallel run's ignore patterns repeat the root config's, because a pattern given on the command line
replaces that list.

The browser lane runs every suite on one setup. Its script runs
[`run-browser-lane.ts`](../../../apps/web/src/test-utils/run-browser-lane.ts) under the shared
cgroup memory cap, locally and on CI. That command builds the web client and the image module's
bundle once into a folder for the run under `node_modules/.cache/nixie-browser-runs`, then runs
`bun test --parallel=1`, which runs the files one after another and isolates each one. It names the
run in `NIXIE_BROWSER_RUN_ID`, because the preload and the suites run again for each file. It
removes the run's folders when the tests end, and its start removes those of a lane that died.

The isolation stops each file's Chrome when the file ends, and the preload,
[`start-browser.ts`](../../../apps/web/src/test-utils/start-browser.ts), starts the next file's
Chrome before its first test, because a cold Chrome start on a fresh CI runner can outlast a test's
limit. The preload also refuses a run with no build. Every suite opens its views through
[`createBrowserView`](../../../apps/web/src/test-utils/create-browser-view.ts), because the first
view's options set the file's one Chrome. It keeps each file's Chrome profile in a folder of its own
in the run's folder. A test runs code in the page through
[`runInPage`](../../../apps/web/src/test-utils/run-in-page.ts), which takes a typed function and a
schema for its result, and keeps `view.evaluate` for a one-line expression.

Chrome and Chromium stop at startup when the socket path under `TMPDIR` is too long for a Unix
socket, and Bun starts Chrome with the environment its process started with. So the lane command
sets `TMPDIR` for the test processes to a folder for the run, under `/tmp` when the host's `TMPDIR`
is too long. Outside CI, each browser suite skips and prints why when no browser starts, through
[`checkBrowserSkip`](../../../apps/web/src/test-utils/check-browser-skip.ts), and the preload runs
the same check, so the run goes on. In CI the check fails the run instead.

Beside the browser suites, five lanes run suites that need a real system the parallel run cannot
host. `bun run test` leaves each one out of the parallel run, and the Agent SDK and e2e lanes'
scripts run their files one at a time. The imp and model API lanes run outside CI, as [Runs](#runs)
gives. The restic lane runs in the Images workflow, against the restic binary that the backup image
carries, and a local run skips it unless `NIXIE_RESTIC_BINARY` names a restic. Each restic command
derives its repository key with scrypt, which restic tunes to take 500 ms, so the lane's limit holds
about twice the time its suite measured on CI.

| Lane      | Files                    | Real system                                                   | Script           | Limit per test     |
| --------- | ------------------------ | ------------------------------------------------------------- | ---------------- | ------------------ |
| Agent SDK | `*.agent-sdk.test.ts`    | The Agent SDK's CLI as a subprocess, against a scripted model | `test:agent-sdk` | 5 s, Bun's default |
| e2e       | every other `e2e/` suite | The built nixie or web client, driven from outside            | `test:e2e`       | 15 s               |
| imp       | `*.imp.test.ts`          | A real impd on a host with `/dev/kvm`                         | `test:imp`       | 14 s               |
| model API | `*.model-api.test.ts`    | The live model, through the pinned Agent SDK                  | SDK contract run | 120 s              |
| restic    | `*.restic.test.ts`       | The restic binary that the backup image pins                  | `test:restic`    | 40 s               |

An Agent SDK suite, in a guest or in `evals/test-utils`, never calls the live model; the SDK
contract suite in `evals/sdk-contract` does. A test in a lane sets no limit of its own, and a slow
test gets a fix, never a raised lane limit. A model API test is the one exception: a live model's
time varies by test, so each sets a limit of about twice its measured time, within the lane's. CI's
test timeouts check lets only a lane script raise the limit. CI runs each lane's script as a check
of its own. The pre-push hook runs no lane: its test job runs, through `bun run test`, only the unit
tests beside the files the branch changes. A suite that spawns nixie, the web client or a build of
either lives under `e2e/`. The web package exports the helpers those suites share from its test
utils.

[`startSpawnedNixie`](../../../e2e/test-utils/start-spawned-nixie.ts) in `e2e/` spawns the test
build of the server's `serve` command as a child process and joins it to
[`startCrashHarness`](../../../libs/testing/src/start-crash-harness.ts), which holds it at fault
points, kills it, and restarts it. In a test build, the server waits at each fault point the test
arms, runs on the harness clock, and adds a test connector with its send tool. Each start of nixie
checks its action queue with an action on the `queue-check` thread, and that action reaches every
action fault point. A crash suite therefore arms an action fault point only after the harness's
queue-check wait returns, and keeps its assertions to the records of its own thread.

The poisoned page journey in `e2e/` runs in process on the server's test harnesses instead, because
the fetcher cannot reach a local page: it replays a recorded fetcher reply through a turn, then a
writer batch.

## Preloads

The unit run leaves isolation off because a fresh global object for each file costs time and memory,
and the preloads' resets already return shared state to a clean baseline after each test.

A preload's body runs once for each worker. Under `--parallel=N --no-isolate` with N of 2 or more,
Bun runs a preload's `beforeAll` and `afterAll` around each file, and otherwise once for the run. So
a preload pairs every start in `beforeAll` with its stop in `afterAll`, and never starts at the top
level. A hook that an imported module registers binds only to the first file that imports it, so a
reset lives in a preload, never in a helper module.

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
each request's body, and the first one's close stops the second. The MSW server passes a request to
a loopback host or to a host under the reserved `.test` domain through to the network, and fails
every other unmatched request. The web server suites call stub APIs on loopback ports, and the
fetcher's suites call test sites under `.test`.

## The test build

The fault points, the controllable clock, the test rule, the test connector and the sandbox double
sit behind `NIXIE_TEST_BUILD`. The release build defines it as `false`, so the bundler drops them,
and every `bun test` run is a test build.

## Shared harnesses

[`libs/testing`](../../../libs/testing/src/) (`@heynixie/testing`) holds the harnesses that more
than one package uses, such as the crash harness, the scripted model, the test clock, and the
condition wait. Each sits in a file named for its export with its own test beside it, and
[its index](../../../libs/testing/src/index.ts) lists the exports, so search there before writing a
harness. It is server-only, so a guest keeps its test helpers in its own package.

Each package keeps the helpers only its own tests use in `src/test-utils/`, each with its own test
file. [`startTestSite`](../../../guests/fetch/src/test-utils/start-test-site.ts) takes the scenario,
its certificate names and response handler, so a test calls it in its body.
[`startFakeImp`](../../../adapters/sandbox-imp/src/test-utils/start-fake-imp.ts) takes none, so
`setupTest()` may wrap it.

A test of the imp port can run a real impd in the test process through `startTestImpd` from
`@impz/testing`, which impz publishes with each `@impz/client` release. That impd runs its own API
and lifecycle on stand-ins for the VMs and the host, so the test needs no `/dev/kvm` and runs in the
unit run.

A server suite runs nixie in the test process through
[`startInProcessNixie`](../../../apps/server/src/test-utils/start-in-process-nixie.ts), with the
stub guest from
[`buildStubGuestSandboxes`](../../../modules/sandbox/src/test-utils/build-stub-guest-sandboxes.ts)
in place of the sandbox adapter, so a turn starts no guest and no Agent SDK. A test that checks what
the model sees asserts on the turn frames the stub guest received. The stub never imitates the SDK's
request to the model, because a copy of the SDK's logic drifts from it unseen. Each in-process start
copies its data directory from a per-run template that
[`writeMigratedData`](../../../apps/server/src/test-utils/write-migrated-data.ts) migrates once, so
its first start runs no migration. A test of the migration from an empty data directory starts a
writer of its own.

The two nixie harnesses stay apart because each checks what the other cannot reach. The in-process
harness hands a test the stub guest's frames, which a child process keeps to itself. The spawned
harness puts a process boundary around nixie, so a suite can kill it, signal it, read its exit code
and start it again on the same data directory. A suite that needs the real guest, a crash or a
signal runs under `e2e/` on `startSpawnedNixie`, and every other server suite runs in process.
