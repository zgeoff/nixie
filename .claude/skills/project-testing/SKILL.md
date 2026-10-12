---
name: project-testing
description:
  nixie's test harness facts — the runs and their gates, the preloads, the test build, the shared
  harnesses in libs/testing, and what an invariant() call means for error coverage. Load it with the
  testing skill whenever you design, write, run, or review tests in this repo.
---

# nixie test harnesses

This skill lists the runs, preloads, and harnesses that exist in this repo, with the paths and
variables that drive them. It describes the code as it is. The rules for writing tests live in the
shared testing skill, and nothing here relaxes them.

## Runs

| Run                    | Command                                                    | Needs                                                                   |
| ---------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Unit and package tests | `bun test` at the root                                     | Bun; the gated suites below skip                                        |
| imp isolation          | `bun test src/isolation.test.ts` in `adapters/sandbox-imp` | An impd on a host with `/dev/kvm`, and the `NIXIE_IMP_TEST_*` variables |
| Live checks            | `bun test <suite>` in `e2e/k3s`                            | A deployed nixie, a kubeconfig, and the variables each suite reads      |

The [imp isolation runbook](../../../docs/runbooks/imp-isolation-tests.md) and the
[live checks runbook](../../../docs/runbooks/live-checks.md) give each run's variables and steps.
The design spikes under `docs/design/` install and run on their own, so the root `bunfig.toml` skips
them.

Plain `bun test` runs the crash suites in `e2e/crash/`, which spawn the test build of nixie from
`e2e/nixie/main.ts` as a child process and drive it through the crash harness.

## Preloads

The root `bunfig.toml` preloads, in order:

1. `libs/testing/src/define-test-build.ts`, which sets the global `NIXIE_TEST_BUILD` to `true`.
2. `@zgeoff/bun-test-extended`, for the jest-extended matchers.
3. `@zgeoff/bun-test-react`, for happy-dom and the Testing Library matchers.
4. `apps/web/src/mocks/test-preload.ts`, which seeds faker, points happy-dom at the web origin, and
   runs the web client's MSW server for the whole run. After each test it resets the handlers, the
   mock store, the browser cookies and `localStorage`.

The MSW server passes a request to a loopback host or to a host under the reserved `.test` domain
through to the network, and fails every other unmatched request. The web server suites call stub
APIs on loopback ports, and the fetcher's suites call test sites under `.test`.

`e2e/k3s/bunfig.toml` preloads only the first two. The live checks call a deployed nixie over the
network, which the web preload's MSW server would intercept.

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

Each package keeps the helpers only its own tests use in `src/test-utils/`, each with its own test
file.

## Invariants

An `invariant()` call from `tiny-invariant` guards a state that the code before it makes impossible,
such as the row that an `UPDATE … RETURNING` on a row the same transaction just read must return. It
declares no error to a caller, so the testing skill's rule that each declared error has its own test
does not reach it, and no test forces it. A guard that real input or a real failure can trip is a
declared error: it throws its own error, and a test reaches it through that input or failure.
