# The nixie harnesses

A server suite runs nixie in the test process through
[`startInProcessNixie`](../../../../apps/server/src/test-utils/start-in-process-nixie.ts), with the
stub guest from
[`buildStubGuestSandboxes`](../../../../modules/sandbox/src/test-utils/build-stub-guest-sandboxes.ts)
in place of the sandbox adapter, so a turn starts no guest and no Agent SDK. A test that checks what
the model sees asserts on the turn frames the stub guest received. The stub never imitates the SDK's
request to the model, because a copy of the SDK's logic drifts from it unseen. Each in-process start
copies its data directory from a per-run template that
[`writeMigratedData`](../../../../apps/server/src/test-utils/write-migrated-data.ts) migrates once,
so its first start runs no migration. A test of the migration from an empty data directory starts a
writer of its own.

The two nixie harnesses stay apart because each checks what the other cannot reach. The in-process
harness hands a test the stub guest's frames, which a child process keeps to itself. The spawned
harness puts a process boundary around nixie, so a suite can kill it, signal it, read its exit code
and start it again on the same data directory. A suite that needs the real guest, a crash or a
signal runs under `e2e/` on `startSpawnedNixie`, and every other server suite runs in process.

[`startSpawnedNixie`](../../../../e2e/test-utils/start-spawned-nixie.ts) in `e2e/` spawns the test
build of the server's `serve` command as a child process and joins it to
[`startCrashHarness`](../../../../libs/testing/src/start-crash-harness.ts), which holds it at fault
points, kills it, and restarts it. In a test build, the server waits at each fault point the test
arms, runs on the harness clock, and adds a test connector with its send tool. Each start of nixie
checks its action queue with an action on the `queue-check` thread, and that action reaches every
action fault point. A crash suite therefore arms an action fault point only after the harness's
queue-check wait returns, and keeps its assertions to the records of its own thread.

The poisoned page journey in `e2e/` runs in process on the server's test harnesses instead, because
the fetcher cannot reach a local page: it replays a recorded fetcher reply through a turn, then a
writer batch.
