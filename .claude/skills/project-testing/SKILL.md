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

This skill lists the runs, preloads, and harnesses that exist in this repo, with the paths and
variables that drive them. It describes the code as it is. The rules for writing tests live in the
shared testing skill. Nothing here relaxes them except the four cases that [Exceptions](#exceptions)
records.

## Runs

| Run                    | Command                                                    | Needs                                                                   |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Unit and package tests | `bun test` at the root                                     | Bun; the gated suites below skip                                        |
| imp isolation          | `bun test src/isolation.test.ts` in `adapters/sandbox-imp` | An impd on a host with `/dev/kvm`, and the `NIXIE_IMP_TEST_*` variables |

The [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) gives that run's
variables and steps. The design spikes under `docs/design/` install and run on their own, so the
root `bunfig.toml` skips them.

Plain `bun test` runs the crash suites in `e2e/crash/`, which spawn the test build of nixie from
`e2e/nixie/main.ts` as a child process and drive it through the crash harness.

## Preloads

The root `bunfig.toml` preloads, in order:

1. `libs/testing/src/define-test-build.ts`, which sets the global `NIXIE_TEST_BUILD` to `true`.
2. `@zgeoff/bun-test-extended`, for the jest-extended matchers.
3. `@zgeoff/bun-test-react`, for happy-dom and the Testing Library matchers.
4. `apps/web/src/mocks/test-preload.ts`, which seeds faker, points happy-dom at the web origin, and
   runs the web client's MSW server for the whole run. After each test it resets the handlers, the
   mock store, the browser cookies, `localStorage`, the system's light or dark setting and the
   document's theme attribute.

The MSW server passes a request to a loopback host or to a host under the reserved `.test` domain
through to the network, and fails every other unmatched request. The web server suites call stub
APIs on loopback ports, and the fetcher's suites call test sites under `.test`.

## The test build

The fault points, the controllable clock, the test rule, the test connector and the sandbox double
sit behind `NIXIE_TEST_BUILD`. The release build defines it as `false`, so the bundler drops them,
and every `bun test` run is a test build.

## Shared harnesses

`libs/testing` (`@heynixie/testing`) holds the harnesses that more than one package uses. It is
server-only, so a guest keeps its test helpers in its own package.

| Harness               | What it does                                                                           |
| --------------------- | -------------------------------------------------------------------------------------- |
| `startCrashHarness`   | Runs the test build of nixie, holds it at fault points, kills it, and restarts it      |
| `startNixieProcess`   | Spawns one nixie process and reports its fault-point arrivals and its exit             |
| `startHarnessLink`    | nixie's half of the crash harness: the one clock, the fault points, and the operations |
| `startProviderDouble` | A local HTTP stand-in for the test connector's provider, which records each send       |
| `startScriptedModel`  | A local stand-in for the Messages API that answers each request with a scripted reply  |
| `buildTestClock`      | A clock that a test steps                                                              |
| `waitForCondition`    | The polling condition wait                                                             |
| `makeGatedCall`       | Holds each call at a gate the test opens, and counts how many calls run at once        |

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
  arguments select the scenario, such as `startTestSite` with its certificate names and response
  handler, stays out of `setupTest()`, because setup never carries scenario data. `setupTest()`
  wraps only a helper that takes no scenario, such as `startFakeImp()`.

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
