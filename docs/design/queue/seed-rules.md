# The lint rules for code that seeds stored state

A test needs stored state before it acts, such as a failed action or a paused task. In the designed
system, a test outside a module gets that state from a test seed that the module publishes. The test
does not write the module's tables itself. Two lint rules enforce this: one reports a direct write
in a test, and one reports a test seed with no test of its own. A test run then fails only when the
module's write code changes. It does not fail because a hand-written row differs from what the code
writes.

The section "Built" gives what the code does. Every section after it gives the designed system. The
sketch files in `sketches/operations/` hold the types and an example call, each in a lettered
section, and this doc holds the rules. A place marked `(open: <name>)` is not settled: see
[the open list](open/operations.md), which links the issue. The rule that every repo with these lint
rules follows is the testing skill's
[seeding reference](../../../.claude/skills/testing/references/seeding.md).

Terms of this doc:

- A **test seed** is a function in a module's test utils that puts one record into one state through
  the module's own write functions. It is not the definitions seed of the
  [glossary](../../glossary.md).
- A **seeder** is an object whose members are test seeds.
- `ctx` is the value that a test's `setupTest()` returns, and `ctx.seed` is its seeder.

## Built

- Test seeds exist as `seed-*.ts` files in the test utils of the tasks, connectors and backup
  modules and of the server app, each with a test beside it.
- Tests in the API module, the sessions module and the server app write another module's tables with
  Kysely. Tests in the API module insert into `actions`.
- The suite that checks a forget against real restic backups writes with raw SQL.
- 5 test files declare a local `seed*` function outside test utils. In the designed system, each
  such function is a test seed of its module.
- nixie pins `@zgeoff/oxlint-config` 0.8.6, which holds neither seed rule. Its rule
  `zgeoff/function-verb` runs as an error.

## Each module publishes a seeder

[The seeders](sketches/operations/02-types.ts), section P, hold the types.
[A test seeds stored state](sketches/operations/01-usage.ts), section C, shows a call.

- A module that owns tables exports one seeder builder from its test utils, named
  `build<Record>Seeder` after the module's main record, as in `buildActionSeeder`. Each test seed is
  one file with a test beside it.
- The actions seeder has one test seed for each `ActionStatus`.
- The tasks seeder has one test seed for each `TaskState` that the module's create function cannot
  produce. The 3 test seeds that exist in the tasks module are members of it.
- The memory seeder has test seeds for items and for proposals: one for each value of each state
  type.
- The connectors seeder and the backup seeder each hold the test seed that exists in their module.
- The module that writes `identities` publishes the identity seeds (open: identities writer).
- Each module exports its test utils through one index file, and never through an export for a
  single file.

## One `buildSeeder` for each package that seeds across modules

- A package whose tests need another module's records has one `buildSeeder(deps)`. It calls the
  seeder builder of each module it needs and returns their test seeds as one seeder.
- 5 packages have one: the API module, the sessions module, the server app, `integration` and `e2e`.
- The `setupTest()` of each test in those packages returns `seed: buildSeeder(deps)`.
- `setupTest()` creates no data.

## The lint

[The lint config](sketches/operations/02-types.ts), section Q, holds the config lines.

- `zgeoff/seed-only` reports a test that writes a table directly, outside the places that the next
  section allows.
- `zgeoff/test-beside-seed` reports a test seed file with no test beside it.
- `.oxlintrc.json` sets both to `error`, and the repo holds no disable comment for either.
- `zgeoff/function-verb` has a clause for the verb `seed`, and it runs as an error.
- Both seed rules are in `@zgeoff/oxlint-config` 0.10.1, and a release after it corrects
  `seed-only`. The version that nixie pins is not chosen (open: lint config version).

## Where a direct write is allowed

A test writes a table directly only in these 4 places:

- in a module's own tests, for that module's tables;
- in the migration tests of the db lib;
- in tests of the code that stores rows, such as a repository function;
- inside a test seed for a state that no code in the repo makes.

The last place is the one exception to the rule that a test seed calls the module's own write
functions. A row that a previous release wrote before a column was required is such a state. The
author of the test seed gives the exact state in a `//` comment.

## Rules for a test and a test seed

- A test outside the 4 places seeds stored state through `ctx.seed`.
- An e2e test never writes with raw SQL.
- A test seed never branches on a state and never bundles several records.
- When a test seed needs a write that the module does not export, the module exports that write
  function.
- A test seed has no port, by [the rules for any port](port-rules.md): it is test code that calls
  the module's own write functions.
- CI runs `bun run lint:full`, the type-aware pass that reports both seed rules with the other lint
  rules. Never run it locally: the host may have too little memory.

## Not in scope

- The other half of the testing skill's rule, that a test reads stored state back through the
  module. It is built.
- Assertions on log lines.
- Any change to product behaviour beyond an export that a test seed needs.
