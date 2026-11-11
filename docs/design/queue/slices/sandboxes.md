# Sandboxes: the work as slices

The docs are [the sandbox sizes](../sandbox-sizes.md),
[the memory-kill signal](../memory-kill-signal.md), [the sandbox images](../sandbox-images.md),
[the sandbox image set](../sandbox-image-set.md) and
[the Kubernetes step order](../kubernetes-step-order.md). The sketches are in
`../sketches/sandboxes/`, and the open items are in [the open list](../open/sandboxes.md).

Each "Needs" line is a dependency fact. Where 2 slices have no dependency, they land in either order
`(open: sandbox slice order)`. Slices 6 to 10 are in
[the sandbox image slices](sandboxes-images.md). Slices 1 to 5 are the children of
[the memory cut](https://linear.app/zgeoff/issue/GEO-2416), which is done when each is done.

Run `bun run models && bun run test:bundles` once before the unit tests of a slice. The test imp
lane takes the variables of the [imp isolation runbook](../../../runbooks/imp-isolation-tests.md).
No slice has a migration, and a rollback of any slice needs no step.

Each slice has the ID `sandboxes-<n>`, which is unique across the queue, and each "Needs" names a
slice by its ID. In any other field of this file, "slice n" means `sandboxes-n`.
[The work list](../work-list.md) gives the build order.

### sandboxes-1. The size table

[The sandbox sizes issue](https://linear.app/zgeoff/issue/GEO-2417).

- **Outcome:** `sandboxSizes` in the sandbox module holds the 3 rows, and the 3 literals are gone:
  `startConversation`, `makeSystemTaskRunner` and the web fetch defaults each import their row from
  `@heynixie/sandbox`. The sandboxes architecture doc states the figures.
- **Follows:** "The size table" and "A sandbox whose size differs from its row" in the sandbox
  sizes; `02-types.ts`, section A, the table only; `03-flow.ts`, section A.
- **Needs:** nothing. It shares no file with sandboxes-4, so the 2 land in either order or in one
  release. Each replaces the conversation's sandbox once, and one release replaces it once for both.
  Between this slice and sandboxes-6, each reader imports its row. sandboxes-6 replaces that import
  with the `sizes` value.
- **Check:**
  - `bun test modules/sandbox/src/sandbox-sizes.test.ts`, a file this slice creates: it pins each
    row, and fails on an odd size and on a size under 128.
  - The tests that pin the built figures change with the table and pass:
    `modules/sessions/src/make-system-task-runner.test.ts`,
    `modules/connectors/src/web-fetch-config-schema.test.ts` (2 places),
    `apps/server/src/load-deployment-config.test.ts` and `apps/server/src/start-web-fetch.test.ts`.
  - Test imp: `bun run test:imp apps/server/`. The 2 sandbox specs in `start-web-fetch.imp.test.ts`
    take the `fetch` row in place of their own 512, so a real fetch passes at 192 MiB. Expect
    `0 fail` and no skipped test.
  - The pull request cites the memory spike's results (`research/sandbox-memory/results.md`): a
    conversation at 512 MiB, a check at 384 MiB and a fetch at 192 MiB, each with no out-of-memory
    kill. It repeats a measurement only when the image changed.
  - Not a gate: "sizes under real work" in the open list runs before a deployment takes the sizes.
- **Deploy:** The first start of the release replaces the conversation's sandbox and each live
  started task's sandbox once. After a step back, the release that nixie steps back to replaces each
  sandbox once more. The host's huge-page pool change
  ([the pool issue](https://linear.app/zgeoff/issue/GEO-2493)) comes only after the sizes are live,
  and it is a step outside this repo, as are
  [the developer imps](https://linear.app/zgeoff/issue/GEO-2492).
- **Milestone:** 1.

### sandboxes-2. The read of memory kills

[The memory-kill signal issue](https://linear.app/zgeoff/issue/GEO-2526).

- **Outcome:** `readMemoryKills` is on the `Sandbox` interface. The imp adapter, the test sandbox
  and the fake runtime each give a count, and `writeMemoryKills` is in the sandbox module's test
  utils. A test imp run shows whether a sleeping sandbox holds its count.
- **Follows:** "The read of the count" in the memory-kill signal; `02-types.ts`, section B;
  `03-flow.ts`, section B, the imp adapter's read.
- **Needs:** nothing.
- **Check:**
  - `bun run test adapters/sandbox-imp/`: the fake runtime gives a count, `unsupported` for a
    missing file and `failed` for a lost connection.
  - `bun run test modules/sandbox/`: a test sandbox with no `/.memory-kills` file gives a count of
    0, and `writeMemoryKills(sandbox, 2)` gives a count of 2.
  - Test imp: `bun run test:imp adapters/sandbox-imp/`. A test file that this slice creates makes a
    sandbox at 192 MiB, spawns a program that takes memory past the guest's limit, and expects
    `readMemoryKills` to give a count of 1 or more.
  - Not a gate: the same test sleeps and wakes the sandbox, reads again, and prints the count before
    and after. The pull request holds that output. It settles "count across sleep" in the open list.
- **Milestone:** 1.

### sandboxes-3. The watcher and its log lines

[The memory-kill signal issue](https://linear.app/zgeoff/issue/GEO-2526).

- **Outcome:** The server applies `watchMemoryKills` to its adapter, and nixie writes the 3 lines.
- **Follows:** "The watcher" and "The log lines" in the memory-kill signal; `02-types.ts`, section
  C; `03-flow.ts`, section B; `01-usage.ts`, section B.
- **Needs:** sandboxes-2. The open items "count across sleep", "baseline line", "unsupported lines"
  and "kills field". When the count is 0 after a wake, this slice is not built. It lands in the
  release that carries sandboxes-1, because the sizes are accepted on the day's check.
- **Check:**
  - `bun run test modules/sandbox/ modules/sessions/ modules/connectors/`, on the test sandbox: a
    turn whose count rises gives one `sandbox.memory_kill` line though the turn succeeds; a second
    turn gives none; a stop's hard kill gives none; a fetch's reply does not wait for the read.
  - `bun run test apps/server/`: a test starts the server's parts twice, once with the adapter that
    the server builds and once with an adapter passed in as `createSandboxAdapter`. On each, a guest
    program whose count rises gives one `sandbox.memory_kill` line. The test fails when the watcher
    is not applied.
- **Milestone:** 1.

### sandboxes-4. The bundled conversation guest

[The bundled guest issue](https://linear.app/zgeoff/issue/GEO-2491).

- **Outcome:** The conversation image holds 2 bundles and the CLI, and `buildGuestCommand` starts
  `bun /app/<package>/<entry>.js` in an image. Each doc that holds the guest's path in the image is
  correct, and the memory spike's `guest/setup.sh` and `guest/check.sh` name the bundle paths.
- **Follows:** "The bundled conversation guest" in the sandbox images; `02-types.ts`, section G;
  `01-usage.ts`, sections D and E; `03-flow.ts`, section E.
- **Needs:** nothing. Do the check of "installed cli path" in the open list before writing the
  lane's start hook: its result decides where the bundle's turn test runs.
- **Check:**
  - Agent SDK lane: `bun run test:agent-sdk guests/conversation/`. A test file that this slice
    creates builds both bundles with the build script and sends one turn and one check through them
    against the scripted model. The build happens in the lane's start hook, because a build outlasts
    the lane's limit. The hook passes the path of the CLI that the workspace's install holds as
    `--cli-path`. The test starts the bundles from a folder with no `node_modules`. This check rests
    on "installed cli path".
  - Images workflow, on the pull request: after the conversation image builds, a step runs
    `/app/claude --version` in it and expects exit 0, and fails when the image holds
    `/app/node_modules`.
  - Test imp, with a test model credential: the bundled image's probe in `01-usage.ts`, section D,
    with its expected output.
  - Test imp, a hand step for the agent that builds the pull request: a throwaway nixie from the
    pull request's images, set up as the Compose guide (`docs/guides/compose.md`) describes, on a
    test runtime with invented definitions. Send one message from its web client. Expect a reply.
    This nixie holds no real memory, and no step sends anything to a production deployment. The same
    throwaway nixie serves "sizes under real work" when it is built with the sizes.
- **Deploy:** each release's nixie image pins its own conversation image, and the release replaces
  the conversation's sandbox once.
- **Milestone:** 1.

### sandboxes-5. The day's check of the sizes

[The sandbox sizes issue](https://linear.app/zgeoff/issue/GEO-2417).

- **Outcome:** One day of use after the release shows no memory kill of a guest of nixie, and no
  create or wake of one of nixie's imps that the runtime refused.
- **Follows:** "The day's check" in the memory-kill signal; `01-usage.ts`, section C.
- **Needs:** sandboxes-1, sandboxes-3. Both are in a release that a deployment runs. When
  sandboxes-3 is not built, the count of kills is a read of the runtime's log on the host.
- **Check:** a read-only step for you or the agent that checks releases. Nobody sends a message for
  it.
  - The 3 commands of `01-usage.ts`, section C, give 1 or more, then 0, and each line of the third
    is explained.
  - The runtime's log on the host holds no refused create and no refused wake for one of nixie's
    imps. That read is a step outside this repo.
- **Milestone:** 1.
