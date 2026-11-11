# Port rules

Read this doc before you add a port, add a provider to a port, or change a port's type. It gives the
rules that every port follows, each with its reason. It also lists the ports of the queue design,
which is the set of design docs in this folder, with the doc that owns each port.

Terms, beside the [glossary](../../glossary.md):

- A **port** is an interface that one module owns and that has a second real provider in sight.
- A **provider** is one implementation of an interface. A **real** provider does the work in a
  release. A **fake** is a provider that a test uses in place of a real one. A stub is a fake.
- **In sight** means that the provider is built, or that a design doc, a decision record or a
  tracker issue plans it.
- An **adapter** is a provider that reaches a system outside nixie, as a package of its own.
- A **guest** is a program that runs inside a sandbox.
- The **composition root** is the server app. It builds each provider and passes it to the module
  that owns the interface.

[Decision 0016](../../decisions/0016-own-interfaces.md) defines nixie's first 6 interfaces. This doc
holds rules only. The doc that owns a port links the TypeScript files, under `sketches/`, that hold
the port's types and error texts. An item marked `(open: <name>)` is not settled, and
[the open list](open/ports.md) holds it.

## Built

The rules apply to every interface that this section lists, port or not.

Three of the 6 interfaces of decision 0016 have a type in the code:

- `ActionConnector` and `Connector` are the connector interface, in the connectors module. The
  action queue calls `ActionConnector`. The server builds the log connector and, in a test build,
  the test connector. `Connector` has the ID, auth, actions and health check. One test builds 2.
- `DefinitionsSource` is in the definitions module, with the path source as its one provider. The
  type allows `bucket`, `git` and `path`, and the config accepts `path`.
- `SandboxAdapter` is in the sandbox module. Its real provider is the `sandbox-imp` adapter. Its
  fake is the process sandbox, which is in the module and which the server builds in a test build
  only. A model credential reaches a sandbox through `SandboxAdapter.addSecret`.

The other 3 are designs. The channel adapter design sketches `ChannelAdapter`, the credentials
design sketches `CredentialStore`, and the trigger source is in [The ports](#the-ports).

The code has 11 more interfaces or provider tables that the rules cover:

- `SearchProvider`, in the connectors module, has the `search-kagi` adapter, with a mock server
  under the adapter's `./mocks` export. The server calls `buildKagiSearch`, and the config's default
  `api_url` is Kagi's.
- `Encoder`, in the memory module, has the `encoder-onnx` adapter and a stub encoder in the memory
  module's test utils.
- `DefinitionsRepo`, in the definitions module, is the export side, which opens pull requests. It
  has the `definitions-github` adapter, with a mock server under `./mocks`, and a stub repo in the
  definitions module's test utils.
- The clock lib has the system clock, and the testing lib has the test clock. The logger lib has
  `makeLogger` and `makeThresholdLogger`.
- `RunStep`, in the tasks module, is the step of a task. The server passes one step per task.
- `RunCheck`, in the sessions module, is the call to the memory checker. The sessions module also
  provides the checker task. The memory module and the skills module import the type from the
  sessions module. The memory module's test utils have a stubbed answer.
- `ConversationMemory`, in the sessions module, is the memory that a turn brings in. The memory
  module provides the store, because memory depends on sessions. The stub is in the sessions
  module's test utils.
- `ReadPage`, in the skills module, is the page reader of web fetch. The skills module is its
  caller. The connectors module provides the fetch sandbox, and its test utils have a stub fetcher.
- `HarnessDescriptor`, in the models module, is the record of a model harness. The module has one
  record, for the Agent SDK harness, in a table that callers read through `getHarness`. The sessions
  module is the main caller.
- The counting proxy has a table of usage dialects, keyed by the route's `api`: `anthropic-messages`
  and `openai-responses`.

The code enforces 4 of the rules:

- An adapter imports only its owning module (rule 3). The boundary tags allow an adapter to import
  any module, so only review enforces this rule.
- One package imports an outside client (rule 5). The `import-zones` lint rule confines imp's client
  to the `sandbox-imp` adapter and `bun:sqlite` to the db lib. It confines the Agent SDK to the
  conversation guest and 3 eval paths: the SDK contract suite, which tests the SDK, and the evals of
  the memory checker and the memory writer.
- A test-only provider needs a test build (rule 7). The sandbox config accepts `imp` and `test`, and
  the server builds the process sandbox only when `NIXIE_TEST_BUILD` is set.
- A provider declares what it can do (rule 8). When the config loads, nixie checks the harness
  capabilities in the wire lib against the needs of each model role. It is the only such check.

The code departs from 7 of the rules. Do not copy a departure.

- The caller owns the type (rule 1). `RunCheck` lives in the module that provides the checker, and
  its callers import it from there. `HarnessDescriptor` does the same, and its intended design has
  it in that module (open: waiting designs).
- What an adapter is (rule 2). The code layout doc, in the architecture docs, limits an adapter to
  the 6 interfaces of 0016. The `search-kagi`, `encoder-onnx` and `definitions-github` adapters each
  implement an interface outside the 6 (open: code layout doc).
- One package imports an outside client (rule 5). The ONNX runtime is a dependency of the
  `encoder-onnx` adapter alone, and the lint rule has no zone for it (open: onnx zone).
- A provider declares what it can do (rule 8). The sandbox adapter declares a `boundary` value, its
  kind of isolation, and the code never reads the value (open: boundary value).
- A caller never branches on a name (rule 9). One error message of the models config schema has the
  harness ID `agent-sdk` written in it (open: agent-sdk in a config error).
- One list of providers (rule 10). The wire lib lists 2 harness IDs, `agent-sdk` and `codex`, and
  the models module has 1 record (open: harness ID lists test).
- A shared contract suite (rule 13). Each adapter has tests of its own, and the imp adapter's
  isolation helpers test imp only.

## The rules

### When a port fits

- Add a port when a second real provider is in sight. With one provider, a provider key in the
  config is a name that selects nothing.
- The queue design has 5 ports: the harness boundary, the memory that a turn brings in, the task
  runner, the trigger source and the page reader of web fetch. [The ports](#the-ports) lists them,
  with one designed read on the built sandbox adapter.
- Search has `SearchProvider` and one real provider, and a second is not in sight. Do not add a
  provider key for search to the config.
- The model of the memory checker has no port. The `checker` role needs the capability
  `structured-output`, and only the Agent SDK harness declares it.
- These 4 timed loops have no port, because the trigger source does not cover them: the backup
  schedule, the 2 lapse sweeps and the definitions poll. Each has its own loop on the clock.
- The key store, the backup target and a push notifier have no interface. The key store has one
  implementation. The backup job has one client, and that client reaches each storage backend
  itself. A push notifier goes behind the channel adapter of 0016 when a design first needs one.

### What every port follows

Each rule has a "Reason" sentence. The agent that wrote this doc wrote most of the reasons, and you
have not confirmed them (open: rule reasons).

1. **The module that calls the interface owns its type.** When the caller cannot depend on the
   provider's module, the caller owns the type all the same, and the composition root passes the
   provider in. `ConversationMemory` and `ReadPage` are the examples to copy. Reason: the caller
   states what it needs, so a provider can change without a change to the caller.
2. **A provider that reaches an outside system is an adapter package named `<interface>-<system>`. A
   provider that reaches nothing outside lives in its module.** Reason: one package holds all of
   nixie's code for one outside system.
   - An adapter provides any interface that a module owns. The 6 interfaces of 0016 are not a limit.
   - A provider that reaches its system from inside a sandbox is a guest, and it is not an adapter.
     The record that describes the guest to the host lives in the module that owns the interface.
     The guest's contract is its message types in the wire lib. Reason: a guest may import only
     libs, so it cannot import a module's interface.
   - The guest rule covers 3 designed guest-side providers: the Codex guest, the request rewriter in
     the conversation guest and a browser reader (open: waiting designs).
   - Where a poll source of a trigger lives is not decided (open: poll source home).
3. **An adapter imports only the module that owns its interface, plus libs.** Reason: an adapter
   that imports a second module ties 2 domains together through an outside system.
4. **Only the composition root constructs an adapter, and only it passes a provider from one package
   to another.** A module never imports an adapter package. Reason: one place wires the providers.
   The rule has 2 exceptions:
   - A test suite builds an adapter itself. The boundary tags let the end-to-end suite and the
     integration suite depend on one.
   - A provider that lives in the package that owns its interface sits in a table in that package,
     as the harness records and the usage dialects do.
5. **One package imports the client of an outside system, and the `import-zones` lint rule enforces
   it.** An adapter that brings a client adds a zone for it. Reason: a second importer of a client
   bypasses the adapter and its tests.
6. **The fake lives with the interface, and the mock of an outside API lives with its adapter.**
   Reason: a test of a caller needs the fake and never the adapter, and a mock server imitates one
   outside API. The trigger source has no designed fake (open: trigger fake).
7. **The composition root builds a test-only provider only when `NIXIE_TEST_BUILD` is set, and a
   release fails its config load on a test-only provider.** Reason: the process sandbox, the one
   test-only provider, isolates nothing, so a release must never start with it.
8. **A provider declares what it can do, and nixie fails the config load on a config that asks a
   provider for something it does not declare.** Reason: a failed config load happens before any
   turn, and a failure in the middle of a turn costs a turn.
   - The rule covers what a config file can ask for, such as a model role on a harness.
   - A read that only gathers evidence is outside the rule. Its provider returns a typed
     `unsupported` at the call when it cannot answer, and the caller records that answer.
   - The limits of a task are outside the rule, because a `task.start` call sets them and a config
     file does not. What nixie does with a limit that the task's runner cannot count is not decided
     (open: runner limits).
9. **Outside the composition root, a caller never branches on a provider's ID or name.** The caller
   reads what the provider declares. Reason: a branch on a name is code that someone must edit for
   each added provider. The composition root is the exception, because it picks a provider by its
   config key.
10. **The set of providers of a port is written once.** One list in the module that owns the port
    has the providers, and nixie builds every schema, union and message that lists them from that
    list. Reason: a second hand-written list falls out of step with the first.
    - One exception: a guest's message types need the provider IDs in the wire lib, and a lib cannot
      import a module. A second list in the wire lib is allowed only with a test that fails when the
      2 lists differ (open: harness ID lists test).
11. **A behaviour that every provider shares is written once, outside the providers.** The shared
    code is either a wrapper around the port or a step in the caller's code path that every call
    passes. Reason: with a copy in each provider, one provider's copy goes wrong alone. The queue
    design has 2 examples. `resolve` of the runner registry is the one lookup of a task's runner.
    `watchMemoryKills` is the one wrapper around the sandbox adapter. Other examples come from
    designs that wait for your decision (open: waiting designs).
12. **The design of a provider that runs in another image or process has a table of release pairs.**
    The table gives what happens for each pairing of the releases of the 2 sides, and nixie stops on
    a pairing that the table lacks. Reason: the 2 sides deploy and roll back separately (open:
    release pair rule).
13. **A port with 2 real providers has one shared contract suite, which tests each real provider and
    the fake.** Write the suite in the pull request that adds the second real provider. Reason: a
    per-adapter test proves one adapter, and only a shared suite proves that the providers agree.
    The harness boundary is the first port with 2 real providers, when the Codex guest exists.
    Whether and when the sandbox adapter gets a suite is open (open: sandbox contract suite).

## The ports

Each linked doc owns its port's contract. This doc gives only the owning module, the providers and
what the rules ask of the port. "Built" marks a provider that the code has, and "designed" marks one
that a queue design adds.

- **The task runner**, in [the task runner port](task-runner-port.md). The tasks module owns the
  port. `RunStep` is built. The designed runner registry has one provider for each of these: the
  conversation, the nixie runner, which executes a started task, the queue check and the 2 fixed
  tasks `memory-writer` and `memory-consolidator`. The registry falls back to the test step or the
  unknown-task step, and the composition root picks the test step in a test build only. A runner for
  a coding session outside nixie is in sight through its tracker issue, and it has no design. nixie
  claims every runner's work through one function, `claimLease`.
- **The memory that a turn brings in**, in [memory recall](memory-recall.md). The sessions module
  owns `ConversationMemory`, and the memory module provides the store. Both are built, with the stub
  in the sessions module's test utils. A second store is not in sight. What varies behind the port
  is the designed list of pushes. A push is one function in the memory module that picks memory
  items for a turn. The memory module calls each push of the list, and the caller never picks one.
- **The sandbox adapter's memory kills**, in [sandbox sizes](sandbox-sizes.md). A memory kill is a
  process in a sandbox that was ended for lack of memory. The designed read `readMemoryKills` is one
  method of `SandboxAdapter`, with 3 designed implementations: the imp adapter, the process sandbox
  and the imp adapter's fake runtime. An adapter returns the count or a typed `unsupported`. Rule 8
  allows that, because the read only gathers evidence. The designed wrapper `watchMemoryKills`
  follows rule 11: the composition root applies it once, around whichever adapter it built.
- **The harness boundary**, in [model harnesses](model-harnesses.md). The models module owns the
  boundary under its intended design (open: waiting designs). The Agent SDK harness is built, and
  the Codex harness is designed. A task on an OpenRouter model uses the Agent SDK harness and adds
  no harness. The Codex guest imports no client, so it adds no import zone. The harness design lacks
  the test of rule 10 and the table of rule 12 (open: harness ID lists test).
- **The page reader**, in [page fetch](page-fetch.md). The skills module owns `ReadPage`, and the
  connectors module provides the fetch sandbox with the fetch guest. Both are built. A headless
  browser reader in an image of its own is in sight through its tracker issue, and it has no design.
- **The trigger source**, in [schedules and triggers](schedules-and-triggers.md). The designed
  triggers module owns `TriggerSource`. The designed schedule source is its first provider, and it
  lives in the module. Poll sources are in sight (open: poll source home). The design has no `log`
  trigger source. Two kinds of function around the module are not providers, and the rules do not
  apply to them. One is the module's seed hook, which the definitions module calls. The other is the
  pair that the composition root passes into the module to avoid an import cycle: the reader
  `readDefinitionTask` and the writer `retireOneShotInTransaction`.

A worker is not a runner. A worker run is a function behind one tool, `worker.run`
([decision 0053](../../decisions/0053-workers.md)). It neither provides the task runner port nor
calls it. It claims nothing: it executes inside a step that its caller claimed.

## Not in scope

Each of these designs has one implementation and no interface. Do not add an interface to one. The
design of the request rewrite, of the turn-input log and of recovery holds each wait for your
decision (open: waiting designs).

- The rewrite of a model request for a route outside the Agent SDK's own models, in the conversation
  guest.
- The turn-input log.
- The typed tuple of sandbox image keys, `sandboxImageKeys`.
- The worker, in [task workers](task-workers.md).
- Recovery holds.
