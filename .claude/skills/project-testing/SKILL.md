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

- [Runs](#runs): `bun run test` at the root runs every suite but the gated ones, which need their
  own host or credential.
- [Preloads](#preloads): the root preloads make every run a test build, swap in Bun's own
  `FormData`, and reset the web client's state after each test.
- [The test build](#the-test-build): the fault points, test clock, and other test-only code sit
  behind `NIXIE_TEST_BUILD`, which every `bun run test` run sets.
- [Shared harnesses](#shared-harnesses): a harness more than one server package uses lives in
  `libs/testing`; search it before writing one.

## Runs

| Run                    | Command                                                         | Needs                                                                                           |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Unit and package tests | `bun run test` at the root                                      | The Bun that `.bun-version` pins; the gated suites below skip                                   |
| imp isolation          | `bun test src/build-imp-port.test.ts` in `adapters/sandbox-imp` | An impd on a host with `/dev/kvm`, and the `NIXIE_IMP_TEST_*` variables                         |
| SDK contract           | `NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract`              | A model credential, or a broker's placeholder, in `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` |

Some tests pin an error that Bun raises, such as the code of a refused connection, and that error
can change between Bun releases, so a run on another Bun can fail where CI passes.

The [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) gives that run's
variables and steps. The [SDK contract suite](../../../evals/sdk-contract/README.md) runs the pinned
Agent SDK against the model. The deployment repo's preview service runs it on a pull request that
changes the SDK version, and posts the result as the `sdk-contract` commit status.

The memory encoder's suites run the real model from `node_modules/.cache/nixie-encoder`, which
`bun run models` fills with the pinned model files after checking each one. `bun run test` runs it
before `bun test --parallel`, which spreads the test files over one worker process per CPU core and
starts each file in a fresh global object. A file therefore never sees a global that another file
set, and a test that only passes after another file breaks there. Plain `bun test` skips those
suites when the files are missing, and CI, where the `CI` variable is set, fails them instead, so a
run there never passes without the model. The spikes under `research/` and `docs/design/` run by
hand, so the root [`bunfig.toml`](../../../bunfig.toml) skips them.

The web app's browser suites, the `*.browser.test.ts` files, drive a headless Chrome or Chromium
through `Bun.WebView`, so `bun test` needs one that Bun finds on `PATH`, in a standard install
location, or at `BUN_CHROME_PATH`. GitHub's Ubuntu runners ship Chrome. `bun run test` leaves the
browser suites out of the parallel run and runs them in one process after it. That process preloads
[`start-browser.ts`](../../../apps/web/src/test-utils/start-browser.ts), which starts the one Chrome
the suites share before the first test. A first Chrome start on a fresh CI runner can outlast the
default test timeout even on an idle CPU, and takes longer still beside the parallel workers. The
parallel run's ignore patterns repeat the root config's, because a pattern given on the command line
replaces that list.

Outside CI, each browser suite skips and prints why when no browser starts, through
[`checkBrowserSkip`](../../../apps/web/src/test-utils/check-browser-skip.ts), and the preload runs
the same check, so the run goes on. In CI the check fails the run instead. Chrome and Chromium stop
at startup when `TMPDIR` is too long for their socket path, so on such a host set `TMPDIR` to a
short directory or point `BUN_CHROME_PATH` at Playwright's `chrome-headless-shell`, which opens no
such socket. Chrome stops under a `ulimit -v` cap, because it reserves more address space than it
uses, so the browser suites skip there.

Two kinds of suite run in a lane of their own: the guest suites that start the real Agent SDK, the
`*.sdk.test.ts` files, and the suites that spawn nixie or a build of it as a child process, the
`*.process.test.ts` files. A cold start of the SDK's CLI or of nixie on a small host outlasts Bun's
default test limit, so `bun run test` leaves these suites out of the parallel run and runs them
after it, one file at a time, under one raised limit for the whole lane. The pre-push test job
splits its run the same way. A test in the lane sets no limit of its own.

`bun run test` runs the crash suites in `e2e/crash/`, which spawn the test build of nixie from
[`e2e/nixie/main.ts`](../../../e2e/nixie/main.ts) as a child process and drive it through
[`startCrashHarness`](../../../libs/testing/src/start-crash-harness.ts), which holds it at fault
points, kills it, and restarts it. The poisoned page journey in `e2e/` runs in process on the
server's test harnesses instead, because the fetcher cannot reach a local page: it replays a
recorded fetcher reply through a turn, then a writer batch.

## Preloads

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
6. The web client's [`test-preload.ts`](../../../apps/web/src/mocks/test-preload.ts), which seeds
   faker, points happy-dom at the web origin, sets an in-memory IndexedDB from fake-indexeddb, and
   runs the web client's MSW server for the whole run. After each test it resets the handlers, the
   mock store, the browser cookies, `localStorage`, IndexedDB, the system's light or dark setting
   and the document's theme attribute.

The MSW server passes a request to a loopback host or to a host under the reserved `.test` domain
through to the network, and fails every other unmatched request. The web server suites call stub
APIs on loopback ports, and the fetcher's suites call test sites under `.test`.

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

A server suite runs nixie in the test process through
[`startTestNixie`](../../../apps/server/src/test-utils/start-test-nixie.ts), with the stub guest
from
[`buildStubGuestSandboxes`](../../../modules/sandbox/src/test-utils/build-stub-guest-sandboxes.ts)
in place of the sandbox adapter, so a turn starts no guest and no Agent SDK. A test that checks what
the model sees asserts on the turn frames the stub guest received. The stub never imitates the SDK's
request to the model, because a copy of the SDK's logic drifts from it unseen. Only a suite in the
process lane spawns nixie, through
[`spawnTestNixie`](../../../apps/server/src/test-utils/spawn-test-nixie.ts), and runs the real
guest.
