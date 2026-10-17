---
name: project-testing
description:
  nixie's test harness facts — the runs and their gates, the preloads, the test build, the shared
  harnesses in libs/testing, what an invariant() call means for error coverage, how the testing
  skill's rules apply to this repo's harnesses, and the four recorded exceptions to the testing
  skill. Load it with the testing skill whenever you design, write, run, or review tests in this
  repo.
---

# nixie test harnesses

This skill holds the runs, preloads, and harnesses particular to this repo, the variables that drive
them, and where to find them. It describes the code as it is. The rules for writing tests live in
the shared testing skill. Nothing here relaxes them except the four cases that
[Exceptions](#exceptions) records.

## Key rules

Each line links the section that explains it.

- [Runs](#runs): plain `bun test` at the root runs every suite but the gated ones, which need their
  own host or credential.
- [Preloads](#preloads): the root preloads make every run a test build, swap in Bun's own
  `FormData`, and reset the web client's state after each test.
- [The test build](#the-test-build): the fault points, test clock, and other test-only code sit
  behind `NIXIE_TEST_BUILD`, which every `bun test` run sets.
- [Shared harnesses](#shared-harnesses): a harness more than one server package uses lives in
  `libs/testing`; search it before writing one.
- [Invariants](#invariants): an `invariant()` guards an impossible state and gets no test.
- [How the shared rules apply here](#how-the-shared-rules-apply-here): a parent record is
  arrangement, the settle window runs on real time, and a scenario helper stays in the test body.
- [Exceptions](#exceptions): the four testing-skill rules this repo relaxes.

## Runs

| Run                    | Command                                                         | Needs                                                                                           |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Unit and package tests | `bun test` at the root                                          | Bun; the gated suites below skip                                                                |
| imp isolation          | `bun test src/build-imp-port.test.ts` in `adapters/sandbox-imp` | An impd on a host with `/dev/kvm`, and the `NIXIE_IMP_TEST_*` variables                         |
| SDK contract           | `NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract`              | A model credential, or a broker's placeholder, in `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` |

The [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) gives that run's
variables and steps. The [SDK contract suite](../../../evals/sdk-contract/README.md) runs the pinned
Agent SDK against the model. The deployment repo's preview service runs it on a pull request that
changes the SDK version, and posts the result as the `sdk-contract` commit status.

The memory encoder's suites run the real model from `node_modules/.cache/nixie-encoder`, which
`bun run models` fills with the pinned model files after checking each one. `bun run test` runs it
before `bun test`. Plain `bun test` skips those suites when the files are missing, and CI, where the
`CI` variable is set, fails them instead, so a run there never passes without the model. The spikes
under `research/` and `docs/design/` run by hand, so the root [`bunfig.toml`](../../../bunfig.toml)
skips them.

The web server's browser suite drives a headless Chrome or Chromium through `Bun.WebView`, so
`bun test` needs one that Bun finds on `PATH`, in a standard install location, or at
`BUN_CHROME_PATH`. GitHub's Ubuntu runners ship Chrome.

Plain `bun test` runs the crash suites in `e2e/crash/`, which spawn the test build of nixie from
[`e2e/nixie/main.ts`](../../../e2e/nixie/main.ts) as a child process and drive it through
[`startCrashHarness`](../../../libs/testing/src/start-crash-harness.ts), which holds it at fault
points, kills it, and restarts it. The poisoned page journey in `e2e/` runs in process on the
server's test harnesses instead, because the fetcher cannot reach a local page: it replays a
recorded fetcher reply through a turn, then a writer batch.

## Preloads

The root [`bunfig.toml`](../../../bunfig.toml) preloads, in order:

1. [`define-test-build.ts`](../../../libs/testing/src/define-test-build.ts), which sets the global
   `NIXIE_TEST_BUILD` to `true`.
2. `@zgeoff/bun-test-extended`, for the jest-extended matchers.
3. `@zgeoff/bun-test-react`, for happy-dom and the Testing Library matchers.
4. [`restore-native-form-data.ts`](../../../libs/testing/src/restore-native-form-data.ts), which
   puts Bun's own `File` and `FormData` back in place of happy-dom's, because Bun's fetch cannot
   send happy-dom's as a multipart body.
5. The web client's [`test-preload.ts`](../../../apps/web/src/mocks/test-preload.ts), which seeds
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
file.

## Invariants

An `invariant()` call from `tiny-invariant` guards a state that the code before it makes impossible,
such as the row that an `UPDATE … RETURNING` on a row the same transaction just read must return. It
declares no error to a caller, so the testing skill's rule that each declared error has its own test
does not reach it, and no test forces it. A guard that real input or a real failure can trip is a
declared error: it throws its own error, and a test reaches it through that input or failure.

## How the shared rules apply here

These cases follow from rules the testing skill states, applied to this repo's harnesses.

- **A parent record is arrangement.** A record that the unit needs and no test varies or reads
  beyond the handles it returns, such as the claimed step an action hangs under, is an earlier act
  that `setupTest()` creates. A value from it that a test's outcome depends on, such as when the
  step's lease expires, stays visible in that test.
- **The crash harness's settle window runs on real time.** It is the harness's deadline for a child
  process to sleep again, and the crash suites never inject a clock. Its tests use the shortest
  faithful settle timeout and pair a settled control with an unsettled one, as the native-timer rule
  asks.
- **A helper that takes the scenario is called from the test body.** A shared `start*` helper whose
  arguments select the scenario, such as
  [`startTestSite`](../../../guests/fetch/src/test-utils/start-test-site.ts) with its certificate
  names and response handler, stays out of `setupTest()`, because setup never carries scenario data.
  `setupTest()` wraps only a helper that takes no scenario, such as
  [`startFakeImp`](../../../adapters/sandbox-imp/src/test-utils/start-fake-imp.ts).

## Exceptions

The testing skill holds four rules that this repo relaxes:

- **A fixed-value stand-in stays inline.** A stand-in that only returns a fixed value, resolves,
  rejects, or never settles, such as `mock(() => new Response('start'))` or a health check that
  resolves `{ isReady: true, reason: null }`, stays in the test that uses it. It models no behaviour
  of the thing it replaces, so a tested file in `src/test-utils/` would only repeat the literal. A
  stand-in that reads its arguments or models a sequence moves to `src/test-utils/` with its own
  tests, as the testing skill requires. Inline data, such as a fixed answer, a recorder or an answer
  table, stays in the test. Inline logic, such as a sequence, a counter, a gate, state, a branch or
  a delay, moves to a tested util, and so does a wrapper that gates, delays or counts calls to a
  tested stand-in.
- **A committed generated reference file is its own golden.** A test that regenerates a reference
  file the repo commits, such as the OpenAPI document, and compares the result with the committed
  file keeps that file as its golden instead of an inline snapshot. Other tools read the committed
  file, such as the compatibility check that reads the OpenAPI document at the last release tag, so
  the test proves that file matches the code, and an inline copy would only duplicate it.
- **A probe listener stopped on the next line needs no fallback cleanup.** A listener that a test
  opens only to learn a free port, and stops on the statement after it reads the port, never
  outlives the test, because nothing between the two statements can throw.
- **A helper whose cleanup acts only after a failed test needs no cleanup-proof test.** When a
  shared helper's cleanup stops work that outlives only a failed test, such as the kill of a web
  build that is still running, a passing test always finishes that work first. A proof would have to
  abandon the real work partway, so the helper's tests leave the cleanup unproved.
