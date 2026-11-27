# Ports

A port is an interface that one module owns and that several providers can implement. This doc holds
the rules for ports, providers and adapters, and lists where the code departs from them.
[The code layout](code-layout.md) covers the packages and the boundary tags that the rules rely on.

## The terms

- A **port** is an interface that one module owns and that a provider implements.
- A **provider** is one implementation of an interface. A real provider does the work in a release.
  A fake provider stands in for it in a test.
- An **adapter** is a provider that reaches a system outside nixie from the server, as a package of
  its own. An outside native runtime, such as the ONNX runtime, counts as an outside system.

## When a port fits

- Plug each outside service that the server reaches in as an adapter, behind an interface that a
  nixie module owns. nixie's core never names an outside service or an optional feature. Each
  optional feature is on only when its section is in the deployment config, and the config key of a
  feature that is off leaves no trace in nixie. A key that picks a test-only provider is allowed
  under rule 7: the sandbox config's `adapter` key, `imp` or `test`, is one. Read
  [Feature switches](deployment/server.md#feature-switches) for the switches and the two checks that
  hold the rule.
- Search has `SearchProvider` and one real provider, so the config has no provider key for search,
  and its `search` section turns the feature on.
- The memory checker's model has no port: the `checker` role needs `structured-output`, and only the
  Agent SDK harness declares it.
- The backup schedule and the definitions poll each run their own loop on the clock. Every other
  periodic sweep, such as memory's lapse sweep, runs on `startSweep` in `libs/clock`. So does the
  shared proposal sweep, which lapses the proposals of every family.
- The key store and the backup target have no interface: the key store has one implementation, and
  the backup job's one client reaches each storage backend itself.

## The rules

1. The module that calls an interface owns its type. When the caller cannot depend on the provider's
   module, the composition root passes the provider in, as for `ConversationMemory` and `ReadPage`.
   The caller states what it needs, so a provider changes without a change to the caller.
2. A provider that reaches an outside system from the server is an adapter package named
   `<interface>-<system>`, for any interface a module owns. A provider that reaches nothing outside
   lives in its module. One package then holds all of nixie's code for one outside system. A
   provider that reaches its system from inside a sandbox is a guest: its contract is its message
   types in the wire lib, and its host-side record lives in the module that owns the interface. A
   guest imports only libs, so it cannot import a module's interface.
3. An adapter imports only the module that owns its interface, plus libs, and review enforces it,
   because the boundary tags allow any module. An adapter that imports a second module ties 2
   domains together through an outside system.
4. Only the composition root constructs an adapter and passes a provider between packages, and a
   module never imports an adapter. A test suite may build an adapter, and a provider that lives in
   its interface's package sits in a table there, as the harness records and the usage dialects do.
   One place then wires the providers.
5. One package imports each outside system's client, and the `import-zones` lint rule enforces it.
   An adapter that brings a client adds its zone. A second importer would bypass the adapter and its
   tests.
6. The fake lives with its interface. The handlers that mock an outside API live in their adapter's
   `./mocks` export, and `libs/mock-server` holds only the shared server they register on. A
   caller's test needs the fake and never the adapter, and a mock imitates one outside API.
7. The composition root builds a test-only provider only when `NIXIE_TEST_BUILD` is set, and a
   release fails its config load on one. The process sandbox isolates nothing, so a release must
   never start with it.
8. A provider declares what it can do, and nixie fails the config load on a config that asks for
   something undeclared. A read that only gathers evidence returns a typed `unsupported` at the
   call, and a task's limits are outside the rule, because `task.start` sets them. A config load
   fails before any turn, and a failure mid-turn costs a turn.
9. Outside the composition root, a caller never branches on a provider's ID or name, and reads what
   the provider declares. A branch on a name is code to edit for each added provider. The
   composition root picks a provider by its config key, and that is the exception.
10. A port's providers are listed once, in the module that owns it, and every schema, union and
    message derives from that list. A second list in the wire lib, which a guest needs, is allowed
    only with a test that fails when the lists differ. A second hand-written list falls out of step.
11. A behaviour every provider shares is written once, as a wrapper around the port or a step every
    call passes. With a copy per provider, one copy goes wrong alone.
12. The design of a provider that runs in another image or process has a table of release pairs, and
    nixie stops on a pairing the table lacks. The 2 sides deploy and roll back apart.
13. A port with 2 real providers has one shared contract suite over each real provider and the fake,
    added in the pull request that adds the second real provider. Only a shared suite proves the
    providers agree.

## Where the code breaks a rule

The code breaks a rule in these places. New code follows the rules.

- `RunCheck`, which the skills module calls, lives in the sessions module, its provider (rule 1).
- `isTestSandbox` in the sandbox module checks `adapter.id === 'process'`, and the sessions module's
  `buildGuestCommand` calls it (rule 9). The server's web fetch and computer starts call it too,
  inside the composition root, where rule 9 allows it.
- Two harness unions are written by hand: the wire lib's turn profile schema in `host-frame.ts` and
  its session point schema in `session-point.ts`. Each names only an `agent-sdk` member, and neither
  derives from `harnessIDs` (rule 10).
- `pickCapturePlan` in the turn-inputs module checks `profile.harness === 'codex'` to skip the
  capture for a Codex step (rule 9).

The wire lib's `harnessIDs` is a second list of the models module's `harnesses`, which rule 10
allows: a test in the models module fails when the two lists differ.

Each row of this table is a place where a core module names a feature ID or an outside service, or
depends on a feature module. In the middle column, a name in code font is a feature ID or an outside
service that the place names, and a phrase such as "the connectors module" is a feature module that
the place imports. Each row comes from the entries in `apps/server/src/leak/leak-exceptions.ts`.
Remove a row and its entries together when the row's work item lands.

| Place                 | Names or depends on                                                                             | Work item                                            |
| --------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `libs/contract`       | `images`, `mcp`, `spend`                                                                        | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/actions`     | the connectors module                                                                           | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/api`         | `coding`, `images`, `mail`, `mcp`, `spend`; the coding, connectors, mail, MCP and spend modules | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/budgets`     | `spend`                                                                                         | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/credentials` | `atc`                                                                                           | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/definitions` | `mcp`                                                                                           | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/log`         | `coding`, `spend`                                                                               | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/models`      | `images`, `openai`                                                                              | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/policy`      | `coding`, `mcp`, `spend`                                                                        | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/proposals`   | `mcp`                                                                                           | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/sandbox`     | `coding`                                                                                        | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/sessions`    | `images`, `mail`, `mcp`, `spend`; the connectors and spend modules                              | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/skills`      | `github`                                                                                        | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/tasks`       | `mail`, `spend`                                                                                 | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/tools`       | `mcp`                                                                                           | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |
| `modules/triggers`    | `mail`                                                                                          | [GEO-2881](https://linear.app/zgeoff/issue/GEO-2881) |

The connections module owns the core `Connector` interface. The `google` feature module builds
Google's connector, with its tools, its record reads and writes and its Gmail poll, and owns the
`GoogleProvider` interface. The `connector-google` adapter fills that interface with Google's hosts,
its OAuth consent, its setup steps and its scope check, and depends on the `google` module alone.

The memory, notebook and skills modules reach a feature module only through another leaking module,
such as the sessions module. They have no import entry, and carry the `leaking` tag until the
entries of the modules they depend on go.

These ordinary words match a feature ID, but none of them means the code feature or the web search
feature. Each one stays, with its reason in the exceptions file:

- `code` for the sign-in and enrolment codes in `libs/contract` and `modules/api`, the OAuth code
  verifier in `modules/credentials`, the OAuth authorization code in `modules/connections`, the code
  check of a policy decision in `modules/log` and `modules/policy`, and the code-made summary of a
  run end in `modules/tasks`;
- `search` for the search mode of the memory view, of memory recall in `modules/memory` and
  `modules/sessions`, and of the note index in `modules/notebook`.
