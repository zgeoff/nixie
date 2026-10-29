# Code layout

nixie's code is one Bun workspace of packages under the `@heynixie/` scope, in 5 folders by trust
zone and role. The server is one deployable that composes many module packages, and the programs
that run inside a sandbox live in their own folder, so a boundary check stops sandbox code from
importing the trusted core. Package boundaries are the module boundaries of
[0025](../decisions/0025-database-and-topology.md): a package exposes only its entry points, and a
tag rule decides which kinds of package may depend on which. [The server](deployment/server.md)
covers how the composition root wires the packages at start, and
[the release pipeline](deployment/release-pipeline.md) covers the images built from them.

## The folders

```text
apps/       deployables: the server, the web client, the counting proxy and the backup job
modules/    domain modules, one package each
guests/     programs that run inside a sandbox and ship in a sandbox image
adapters/   implementations of nixie's own interfaces that reach one outside system
libs/       shared code that belongs to no domain
```

- **`apps/server`** is the composition root. It constructs each adapter, passes it to the module
  that owns the interface, and starts the runners. Modules never import adapters, so one place wires
  them.
- **`apps/web`** is the TanStack Start server and its client code. It reaches nixie only through the
  oRPC contract in `libs/contract`, as [the API](channels/api.md) describes.
- **`apps/counting-proxy`** is [the counting proxy](policy/counting-proxy.md), a process of its own
  on the host that every model request of a deployment it guards passes through.
- **`apps/backup-job`** is [the backup job](deployment/backups.md#the-backup-job), which ships
  nixie's snapshot sets with restic from its own image and holds the backup credentials.
- **An adapter** implements one of the [0016](../decisions/0016-own-interfaces.md) interfaces
  against one outside system, and its name is `<interface>-<system>`, such as `sandbox-imp`. An
  implementation that reaches nothing outside nixie, such as the path definitions source, stays in
  its module.
- **A guest** holds the code a sandbox image runs. It depends only on `libs/wire`, and speaks to
  nixie through those wire formats over the sandbox's route back to nixie.

The workspace globs cover those 5 folders, the Pulumi component, the root `e2e/` and `evals/`
packages, and the spikes in `research/`. The spikes join the workspace so that CI typechecks them,
and they stand outside the package rules here: a spike pins the exact versions it ran against,
imports product files by path with a `@boundaries-ignore` comment, and has no tests that CI runs. A
spike whose pins conflict with the workspace stays out of it and installs on its own, as do the
Agent SDK spikes under `docs/design/`.

`deploy/` holds the deployment artifacts nixie ships: the Compose recipe in `deploy/compose/`, the
[reference Kubernetes manifests](deployment/kubernetes.md) in `deploy/kubernetes/`, and the
[Pulumi component for Kubernetes](deployment/kubernetes.md#the-pulumi-component) in
`deploy/pulumi-k8s/`. The component is the one workspace package under `deploy/`, because it has
tests and a typecheck, and the rest of `deploy/` sits outside the workspace. `preview/` holds the
image recipe for the test build of one pull request.

## Packages

Every package name is `@heynixie/` plus its folder name, and every package is private except the
Pulumi component and the API contract, which each release
[publishes to npm](deployment/release-pipeline.md#build-settings-and-publishing). A deployment's own
Pulumi program installs the component, so its package declares the Pulumi SDKs as peer dependencies
with a range, and the catalog pins the versions its tests run against. A library package is consumed
as source: its `exports` map points at `./src/index.ts`, and nothing builds it before use. A package
whose helpers other packages' tests use exports them as a second entry, `./test-utils`. A package
that nothing imports, such as `apps/web`, the fetch guest or the root suites, has no `exports` map.
An `exports` map refuses every subpath it does not list, and `turbo boundaries` refuses a relative
path into another package, so no package imports another package's internal files.

Every external version lives once, in the root `workspaces.catalog`. A package writes `"catalog:"`
for an external dependency and `"workspace:*"` for an internal one, and pins no version itself. The
root `package.json` declares only tooling, never a runtime dependency. `bunfig.toml` sets the
isolated linker, so a package resolves only what it or the root declares. It also saves exact
versions, and installs only versions past a minimum release age. The first-party `@zgeoff/` packages
are exempt from the age, so their bumps install at once.

TypeScript is version 7. `tsconfig.base.json` extends `@tsconfig/strictest` with `module: Preserve`
and `moduleResolution: bundler`, and sets no `baseUrl` and no path aliases, so every import is a
package name or a path relative to the importing file. Each package extends the base and has its own
`typecheck` script.

## Boundaries

Each package has a `turbo.json` that holds only its tags, and `turbo boundaries` checks every
dependency against the rules in the root `turbo.json`. The check fails on a dependency the rules
deny, an import of a workspace package that the importer does not declare, an import of a file
outside the importer's package, and a cycle between packages.

| Tag       | Packages                             | May depend on                     |
| --------- | ------------------------------------ | --------------------------------- |
| `app`     | `apps/server`, `apps/counting-proxy` | modules, adapters, libs           |
| `client`  | `apps/web`                           | libs without `server-only`        |
| `sidecar` | `apps/backup-job`                    | libs without `server-only`        |
| `module`  | `modules/*`                          | other modules, libs               |
| `adapter` | `adapters/*`                         | modules, libs                     |
| `guest`   | `guests/*`                           | libs without `server-only`        |
| `lib`     | `libs/*`                             | libs                              |
| `deploy`  | `deploy/pulumi-k8s`                  | no workspace package              |
| `e2e`     | `e2e/`                               | the apps, modules, adapters, libs |
| `eval`    | `evals/`                             | modules, guests, libs             |

The backup job depends on libs alone, so it never reaches the modules that hold the deployment key.
Nothing depends on the `e2e` and `eval` packages, so their wide rules never let production code
reach test code.

- **Libs depend only on libs.** A guest or a client therefore never reaches a module through a lib,
  because no lib can depend on one.
- **`server-only`** marks a lib that only the trusted core and the test suites may use: `libs/db`
  and `libs/testing`. Its rule allows dependents tagged `app`, `module`, `adapter`, `server-only`,
  `e2e` or `eval`, so a guest or a client that declares it fails the check.
- **An adapter depends only on the module that owns its interface.** The tags allow any module, so
  review holds this rule.
- **Modules form no cycles.** `turbo boundaries` refuses a cycle, so a module that needs work from a
  module that depends on it takes that work through an interface the server passes in.

A few imports belong to one package each:

| Import                              | The only package that may import it |
| ----------------------------------- | ----------------------------------- |
| The Agent SDK                       | `guests/conversation`               |
| imp's client                        | `adapters/sandbox-imp`              |
| `bun:sqlite` and the Kysely dialect | `libs/db`                           |

The `zgeoff/import-zones` lint rule refuses each of these imports outside its one package. The Agent
SDK has one exception: the SDK contract suite and the eval helpers in `evals/` drive the SDK itself,
to check the behaviours nixie relies on, so the rule lets them import it. The rule covers
`bun:sqlite`, which Bun provides with no declared dependency. Lint also refuses `require`,
`import.meta.require`, `node:module` and any `import()` whose specifier the rule cannot read, so no
import escapes the zones. The Agent SDK runs only inside a sandbox
([0003](../decisions/0003-sdk-placement.md)), and one package owns each outside system.

## Modules

Each module package covers one area of the architecture, and its doc covers the package.

| Package       | Area                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `log`         | [The event log](core/event-log.md), keys, projections and the [single writer](core/database.md)                                            |
| `tasks`       | [Tasks](core/tasks.md), [leases](core/leases-and-recovery.md), the inbox, waits and timers                                                 |
| `actions`     | [The action queue](core/actions.md), attempts, outcomes and retries                                                                        |
| `models`      | [Model profiles](core/model-profiles.md), roles and cost                                                                                   |
| `sessions`    | The [conversation's turns](core/conversation-turns.md), [session opening](core/session-opening.md) and each system task's own session      |
| `compaction`  | The [compactor](core/compaction.md) and its summary records                                                                                |
| `definitions` | [The definitions](core/definitions.md) and the path source                                                                                 |
| `prompts`     | The built-in [prompts](core/prompts.md), their parts and templates, and the render that applies the overrides                              |
| `policy`      | [The decision point](policy/decision-point.md) and its fixed rules                                                                         |
| `api`         | [The API](channels/api.md): the oRPC router, device sessions and the live stream                                                           |
| `sandbox`     | The [sandbox adapter](connectors/sandboxes.md) interface, sandboxes by kind and the sandbox double                                         |
| `tools`       | The [tool endpoint](connectors/tool-calls.md) per task run                                                                                 |
| `connectors`  | The [web fetch](connectors/web-fetch.md) and [time](connectors/time.md) tools                                                              |
| `memory`      | The [memory store](memory/store.md), its writer, consolidation and context                                                                 |
| `backup`      | The snapshot sets and receipts of [backups](deployment/backups.md) and their schedule                                                      |
| `ops`         | The health checks behind [the server's](deployment/server.md) health endpoint                                                              |
| `skills`      | [Skills](core/skills.md): the pins, the catalog, the skill tools and the skill proposals                                                   |
| `proposals`   | The review lifecycle that [skill proposals](core/skills.md#skills-that-nixie-writes) run on: its moves, its lapse time and the lapse sweep |

The other packages each hold one piece the modules and apps share:

- `guests/conversation` runs the conversation's turns through the Agent SDK.
- `guests/fetch` runs the web fetch inside the fetch sandbox.
- `adapters/sandbox-imp` is the sandbox adapter on imp.
- `adapters/encoder-onnx` is the memory module's text encoder, which runs a pinned embedding model
  on ONNX Runtime.
- `libs/contract` holds the oRPC contracts of the API and the host commands, with the client code
  that the web client uses.
- `libs/db` is nixie's Kysely dialect for `bun:sqlite` off the main thread, the migration runner and
  the schema version from [the database](core/database.md#migrations), tagged `server-only`.
- `libs/wire` holds the message formats that cross a sandbox boundary.
- `libs/clock` is the one clock that every time and every wait reads. A test build replaces it with
  a clock the test steps.
- `libs/retry` is the backoff that sets the wait before each retry, so every part that retries backs
  off the same way.
- `libs/async` holds the promise helpers, such as the wait for work to settle that a caller uses
  when another part reads the work's failure.
- `libs/logger` is the logger, so a module that logs needs none of the health code.
- `libs/testing` holds the test helpers and the [crash test harness](core/crash-tests.md), tagged
  `server-only`.

## Tests and checks

Tests run on `bun test`, and each test sits beside the module it tests, as `x.test.ts` beside
`x.ts`. A lint rule refuses a test file with no module of its name beside it. The only test folders
are the root `e2e/`, which holds whole-program suites such as the
[crash tests](core/crash-tests.md), and the root `evals/`, which checks committed evaluation reports
against the code. A guest keeps its test helpers inside its own package, because `libs/testing` is
server-only.

The product tests that run the Agent SDK's `query()` live in `guests/conversation`, the one product
package that imports the SDK. They run against the scripted model from the crash test harness, so
none of them needs an imp or a real model. One exception: the
[SDK contract suite](../../evals/sdk-contract/README.md) in `evals/` runs SDK queries against a real
model, to check the SDK behaviours nixie relies on. Its probes run only with `NIXIE_SDK_CONTRACT=1`
and a model credential, and skip otherwise, so a plain `bun test` never calls a model. Whole-program
suites in `e2e/` run nixie with the sandbox double, which starts the conversation guest as a local
process, so the SDK still loads only from its own package. A module's tests of a system task that
runs its own session, such as the memory writer, run the conversation guest in the sandbox double
too, which the sessions module's test helpers start beside a log outside the server. An eval run
that calls a real model is a script a contributor runs by hand, and its suite checks only the
committed report.

### Test builds

The fault points, the controllable clock, the test rule, the test connector and the sandbox double
exist only in a test build. Each sits behind the global constant `NIXIE_TEST_BUILD`. The release
build defines it as `false`, so the bundler drops every branch behind it with its imports, and the
test runner's preload defines it as `true`. The composition root wires the test pieces in a test
build and the production pieces otherwise. The release bundle therefore holds no fault point, clock
control or test rule, rather than holding them switched off. The release build fails when the bundle
contains a fault point ID, the test rule's ID or the test sandbox.

The checks are oxfmt, oxlint with type-aware rules on `@zgeoff/oxlint-config`, typecheck, knip for
dead code, `turbo boundaries`, the prose check and the tests. lefthook fixes formatting and plain
lint on the staged files before a commit. Before a push it lints, typechecks and tests what each
pushed commit changes from main, whatever the working tree holds, and it runs the whole-tree format,
boundary and prose checks. CI runs the shared Bun pull-request workflow from the tools repo with
nixie's script list, which adds the dependency audit, the type-aware lint, dead code and the whole
test suite.
