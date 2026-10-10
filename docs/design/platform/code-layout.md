# Code layout

nixie's code is one Bun workspace of packages under the `@heynixie/` scope, in 5 folders by trust
zone and role. The server is one deployable that composes many module packages, and the programs
that run inside a sandbox live in their own folder, so a boundary check stops sandbox code from
importing the trusted core. Package boundaries are the module boundaries of
[0025](../../decisions/0025-database-and-topology.md): a package exposes only its entry point, and a
tag rule decides which kinds of package may depend on which. Each slice creates the packages it
first builds, so the workspace grows with the
[slices](https://linear.app/zgeoff/document/slice-plan-f056442e64a3).

## The folders

```text
apps/       deployables: the server, the web client, and the Android app
modules/    domain modules, one package each
guests/     programs that run inside a sandbox and ship in a sandbox image
adapters/   implementations of nixie's own interfaces that reach one outside system
libs/       shared code that belongs to no domain
```

- **`apps/server`** is the composition root. It constructs each adapter, passes it to the module
  that owns the interface, and starts the runners. **Why:** modules never import adapters, so one
  place wires them.
- **`apps/web`** is the Start server and its client code. It reaches nixie only through the oRPC
  contract, as [the client](channels/client.md) requires.
- **An adapter** implements one of the [0016](../../decisions/0016-own-interfaces.md) interfaces
  against one outside system, and its name is `<interface>-<system>`, such as `sandbox-imp`. An
  implementation that reaches nothing outside nixie, such as the path definitions source, stays in
  its module.
- **A guest** holds the code a sandbox image runs. It speaks to nixie only through the wire formats
  in `libs/wire`, over the sandbox's route back to nixie.

The workspace globs are `apps/*`, `modules/*`, `guests/*`, `adapters/*` and `libs/*`. `spikes/`
stays outside the workspace, and each spike installs on its own.

## Packages

Every package name is `@heynixie/` plus its folder name, and every package is private until it
publishes. A package is consumed as source: its `exports` map points at `./src/index.ts`, and
nothing builds it before use. An `exports` map refuses every package subpath it does not list, and
`turbo boundaries` refuses a relative path into another package, so no package imports another
package's internal files.

Every external version lives once, in the root `workspaces.catalog`. A package writes `"catalog:"`
for an external dependency and `"workspace:*"` for an internal one, and pins no version itself. The
root `package.json` declares only tooling, never a runtime dependency. `bunfig.toml` sets
`linker = "isolated"`, so a package resolves only what it or the root declares, with `exact = true`
and `minimumReleaseAge = 604800`, which installs only versions published at least 7 days earlier.

TypeScript is version 7. `tsconfig.base.json` extends `@tsconfig/strictest` with `module: Preserve`
and `moduleResolution: bundler`, and sets no `baseUrl` and no path aliases, so every import is a
package name or a path relative to the importing file. Each package extends the base and has its own
`typecheck` script.

## Boundaries

Each package has a `turbo.json` that holds only its tags, and `turbo boundaries` checks every
dependency against the rules in the root `turbo.json`. The check fails on a dependency the rules
deny, an import of a workspace package that the importer does not declare, an import of a file
outside the importer's package, and a cycle between packages.

| Tag       | Packages                    | May depend on              |
| --------- | --------------------------- | -------------------------- |
| `app`     | `apps/server`               | modules, adapters, libs    |
| `client`  | `apps/web`, the Android app | libs without `server-only` |
| `module`  | `modules/*`                 | other modules, libs        |
| `adapter` | `adapters/*`                | modules, libs              |
| `guest`   | `guests/*`                  | libs without `server-only` |
| `lib`     | `libs/*`                    | libs                       |

- **Libs depend only on libs.** A guest or a client therefore never reaches a module through a lib,
  because no lib can depend on one.
- **`server-only`** marks a lib that only the trusted core may use, such as the database layer. Its
  rule allows dependents tagged `app`, `module`, `adapter` or `server-only`, so a guest or a client
  that declares it fails the check.
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

An oxlint `no-restricted-imports` rule refuses each of these imports everywhere, with an override
for its one package. The rule covers `bun:sqlite`, which Bun provides with no declared dependency.
Lint also refuses `require` and any `import()` whose specifier is not a string literal, so no import
escapes the restricted-imports rule. **Why:** the Agent SDK runs only inside a sandbox
([0003](../../decisions/0003-sdk-placement.md)), and one package owns each outside system.

## Modules

Each package covers one design area. Its first slice creates it, and later slices extend it.

| Package       | Design area                                                                          | First slice |
| ------------- | ------------------------------------------------------------------------------------ | ----------- |
| `log`         | [The event log](core/event-log.md), keys, projections, the single writer             | 1           |
| `tasks`       | [Tasks](core/tasks.md), leases, the inbox, waits, timers, the runner                 | 1           |
| `actions`     | [The action queue](core/actions.md), attempts, outcomes, retries                     | 1           |
| `models`      | [Model profiles](core/models.md), roles and cost                                     | 1           |
| `policy`      | [The decision point](policy/decision-point.md), rules, approvals, budgets            | 1           |
| `api`         | The oRPC router, device sessions, the live stream, paste spans                       | 1           |
| `sandbox`     | The [sandbox adapter](connectors/sandbox-adapter.md) interface and sandboxes by kind | 1           |
| `tools`       | The [tool endpoint](connectors/tools.md) per task run                                | 1           |
| `definitions` | The [definitions source](connectors/definitions-source.md) and the path source       | 1           |
| `connectors`  | The [connector](connectors/connector.md) interface and the web fetch tool            | 1           |
| `ops`         | Health, then backup, restore and upgrades                                            | 1           |
| `credentials` | The [credential store](connectors/credentials.md) and its backends                   | 3           |
| `push`        | The [channel adapter](channels/channel-adapter.md) for pushes                        | 3           |
| `memory`      | The [memory store](memory/store.md), writes and context                              | 4           |
| `triggers`    | The [trigger source](channels/trigger-source.md)                                     | 6           |
| `proxy`       | The [external MCP server proxy](connectors/mcp-proxy.md)                             | 8           |
| `coding`      | The code tool and the [coding adapter](connectors/coding.md) interface               | 8           |

The dashboard, the live view and the approval cards are client views in `apps/web`, and `api` serves
their data.

Slice 1 also creates these packages:

- `guests/conversation`, which runs the conversation's turns through the Agent SDK
- `guests/fetch`, which runs the web fetch inside the fetch sandbox
- `adapters/sandbox-imp`, the sandbox adapter on imp
- `libs/contract`, the oRPC contract with the client code both clients share, under
  [the client](channels/client.md)
- `libs/db`, nixie's Kysely dialect for `bun:sqlite` off the main thread, tagged `server-only`
- `libs/wire`, the message formats that cross a sandbox boundary
- `libs/testing`, the test helpers, tagged `server-only`

Later adapters follow the same naming, such as `push-telegram` and `connector-kagi` in slice 3,
`connector-google` in slice 6 and `coding-atc` in slice 8.

## Images

One release builds every image from one commit, as [the image](deployment/deployment.md#the-image)
describes.

| Image        | Built from                                | First slice |
| ------------ | ----------------------------------------- | ----------- |
| nixie        | `apps/server`, bundled with `bun build`   | 1           |
| web          | `apps/web`                                | 1           |
| conversation | `guests/conversation`                     | 1           |
| fetch        | `guests/fetch`                            | 1           |
| worker       | The conversation image plus code runtimes | 2           |
| code         | Code runtimes only, with no nixie package | 8           |

## Tests and checks

Tests run on `bun test`, with `@zgeoff/bun-test-extended` preloaded for its matchers. Each test sits
beside the module it tests, as `x.test.ts` beside `x.ts`. The only test folder is the root `e2e/`,
which holds whole-program suites and the live checks against a Kubernetes or Compose deployment. A
test that needs a database opens its own SQLite file in a temporary directory. A guest keeps its
test helpers inside its own package, because `libs/testing` is server-only.

The checks are oxfmt, oxlint with type-aware rules on `@zgeoff/oxlint-config`, typecheck, knip for
dead code, `turbo boundaries`, the prose check and the tests. lefthook runs the fast checks before a
commit and the rest before a push. CI runs the shared Bun pull-request workflow from the tools repo
with nixie's script list, which runs the standard script list plus `boundaries` and the prose check.
