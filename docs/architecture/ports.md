# Ports

A port is an interface that one module owns and that several providers can implement. This doc holds
the rules for ports, providers and adapters, and lists where the code departs from them.
[The code layout](code-layout.md) covers the packages and the boundary tags that the rules rely on.

## The terms

- A **port** is an interface that one module owns and that has a second real provider in sight. A
  second provider is in sight when it is built, or when a design, a decision record or a tracker
  issue plans it.
- A **provider** is one implementation of an interface. A real provider does the work in a release.
  A fake provider stands in for it in a test.
- An **adapter** is a provider that reaches a system outside nixie, as a package of its own. An
  outside native runtime, such as the ONNX runtime, counts as an outside system.

## When a port fits

- A port exists only when a second real provider is in sight, because with one provider a provider
  key in the config selects nothing. A key that picks a test-only provider is allowed under rule 7:
  the sandbox config's `adapter` key, `imp` or `test`, is one.
- Search has `SearchProvider` and one real provider, so the config has no provider key for search.
- The memory checker's model has no port: the `checker` role needs `structured-output`, and only the
  Agent SDK harness declares it.
- The backup schedule, the 2 lapse sweeps and the definitions poll each keep their own loop on the
  clock.
- The key store and the backup target have no interface: the key store has one implementation, and
  the backup job's one client reaches each storage backend itself.

## The rules

1. The module that calls an interface owns its type. When the caller cannot depend on the provider's
   module, the composition root passes the provider in, as for `ConversationMemory` and `ReadPage`.
   The caller states what it needs, so a provider changes without a change to the caller.
2. A provider that reaches an outside system is an adapter package named `<interface>-<system>`, for
   any interface a module owns. A provider that reaches nothing outside lives in its module. One
   package then holds all of nixie's code for one outside system. A provider that reaches its system
   from inside a sandbox is a guest: its contract is its message types in the wire lib, and its
   host-side record lives in the module that owns the interface. A guest imports only libs, so it
   cannot import a module's interface.
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

## Departures on main

These are places where the code departs from a rule today. Do not copy them into new code.

- `RunCheck` in the sessions module and `HarnessDescriptor` in the models module live in their
  provider's module (rule 1).
- The ONNX runtime and `@huggingface/tokenizers` have no import zone (rule 5), until
  [the ONNX import zone](https://linear.app/zgeoff/issue/GEO-2574) lands.
- `isTestSandbox` in the sandbox module checks `adapter.id === 'process'`, and the sessions module's
  `buildGuestCommand` calls it (rule 9). The server's web fetch start also calls it, inside the
  composition root.
- The models config schema's 2 harness messages write `agent-sdk` (rules 9 and 10), until
  [the harness list in the config error](https://linear.app/zgeoff/issue/GEO-2579) lands.
- The wire lib lists `harnessIDs` and `harnessCapabilities`, `codex` included, and the models
  module's table has one record, with no test across them (rule 10).
- Each harness union is assembled by hand, apart from the models module's harness table in
  `get-harness.ts`. They are the profile schema tuple in
  `modules/models/src/models-config-schema.ts`, and the wire lib's turn profile schema in
  `host-frame.ts` and session point schema in `session-point.ts`, which each name an `agent-sdk`
  member (rule 10).
- `pickCapturePlan` in the turn-inputs module checks `profile.harness === 'codex'` to skip the
  capture for a Codex step (rule 9).
