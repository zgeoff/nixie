# The nixie harnesses

Pick the harness by what the suite needs:

- Use the spawned harness, `startSpawnedNixie`, in a suite under `e2e/`, when the suite needs the
  real conversation guest, a crash, a signal, an exit code, or a restart on the same data directory.
  Only a child process gives a test those.
- Use the in-process harness, `startInProcessNixie`, for every other server suite. Only it shows the
  test the turn frames, the messages each turn sends to the conversation guest.

Keep an in-process suite beside the module it tests. When it runs one flow across several packages,
put it in [`integration/`](../../../../integration/).

## The in-process harness

[`startInProcessNixie`](../../../../apps/server/src/test-utils/start-in-process-nixie.ts) starts
nixie inside the test process, with the stub guest from
[`buildStubGuestSandboxes`](../../../../modules/sandbox/src/test-utils/build-stub-guest-sandboxes.ts)
in place of the sandbox adapter. A turn starts no guest process and no Agent SDK.

- To check what the model sees, assert on `guest.received` in the harness's result: the turn frames
  the stub guest received.
- Never make the stub imitate the SDK's request to the model. A copy of the SDK's logic drifts from
  the SDK, and no test sees it.
- Expect no migration on a start. The harness copies each data directory from a template that
  [`writeMigratedData`](../../../../apps/server/src/test-utils/write-migrated-data.ts) migrates
  once, and again only when the database or log sources change. To test the migration itself, open
  an empty data directory with [`startWriter`](../../../../modules/log/src/start-writer.ts).

## A crash suite on the spawned harness

[`startSpawnedNixie`](../../../../apps/server/src/test-utils/start-spawned-nixie.ts) runs the
server's test bundle as a child process, with a scripted model and a provider double in the test
process. The test bundle is the server built with its test-only code, such as its fault points,
switched on. Run the suites with `bun run test:e2e`, which builds the test bundle before the first
start.

Write a crash suite in this order, as [`retry.test.ts`](../../../../e2e/crash/retry.test.ts) does:

1. Start nixie with `nixie.harness.start()`, and await the process's `ready`.
2. Await `nixie.waitForQueueCheck()`. Each start of nixie runs one action of its own, on the
   `queue-check` thread, to check its action queue. That action stops at every action fault point
   that is armed, so an earlier arm catches it in place of your action.
3. Arm a fault point with `process.request('arm', { point, kind: 'action' })`. A fault point is a
   named place in the server where a runner reports its arrival and waits.
   [Crash tests](../../../../docs/architecture/core/crash-tests.md) lists them.
4. Script the model with `nixie.model.addReplies`, such as a call to the test connector's
   `test_send` tool, which queues an action. Then send a message with
   `process.request('sendMessage', { thread, text })`.
5. Await `process.waitForArrival(point)`, then `process.kill()`.
6. Start nixie again with `nixie.harness.start()`, and repeat step 2 before you arm anything.

Inside the test bundle, nixie reads the harness clock, which moves only when the test calls
`nixie.harness.advance`. The test process keeps real time. Read nixie's records with
`nixie.readRecords()` or `nixie.waitForRecord()`, and match only the records whose `thread` is your
suite's. The queue check writes records too.
