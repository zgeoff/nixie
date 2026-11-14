# The nixie harnesses

Pick the harness by what the suite needs:

- Use the spawned harness, `startSpawnedNixie`, in a suite under `e2e/`, when the suite needs the
  real conversation guest, a crash, a signal, an exit code, or a restart on the same data directory.
  Only a child process gives a test those. The conversation guest is the program that runs each turn
  through the Agent SDK inside a sandbox, as the [glossary](../../../../docs/glossary.md) says.
- Use the in-process harness, `startInProcessNixie`, for every other server suite. Only its test can
  read the turn frames: the messages each turn sends to the conversation guest.

Put an in-process suite in a `*.test.ts` file beside the source file it tests. When it runs one flow
across several packages, put it in [`integration/`](../../../../integration/).

## The in-process harness

[`startInProcessNixie`](../../../../apps/server/src/test-utils/start-in-process-nixie.ts) starts
nixie inside the test process, with the stub guest from
[`buildStubGuestSandboxes`](../../../../modules/sandbox/src/test-utils/build-stub-guest-sandboxes.ts)
in place of the sandbox adapter. A turn starts no guest process and no Agent SDK.

- To check what the model sees, assert on `guest.received` in the harness's result: the turn frames
  the stub guest received.
- Never make the stub imitate the SDK's request to the model. A copy of the SDK's logic drifts from
  the SDK, and no test catches the drift.
- Run no migration in the test. Each harness start copies its data directory from the migrated-data
  template: a data directory with every migration run.
  - `bun run test` builds the template with `bun run test:templates` before the unit tests start.
    Before you run one file with `bun test <path>`, run `bun run test:templates` yourself.
  - After any change under `libs/db/src/` or `modules/log/src/`, run `bun run test:templates` again.
    The template's name holds a hash of those folders, so the first start after such a change finds
    no template, builds one itself, and can run past the unit lane's 5 s limit.
  - [`writeMigratedData`](../../../../apps/server/src/test-utils/write-migrated-data.ts) holds the
    template's inputs, and builds the template on a start that finds none.
- To test a migration, leave the harness out. Open an empty data directory of your own with
  [`startWriter`](../../../../modules/log/src/writer/start-writer.ts), which runs every migration.

## A crash suite on the spawned harness

[`startSpawnedNixie`](../../../../apps/server/src/test-utils/start-spawned-nixie.ts) runs the
server's test bundle as a child process: the server built with its test-only code, such as its fault
points, switched on. Run the suites with `bun run test:e2e`, which builds the test bundle before the
first start.

- The test process holds a scripted model, and a provider double that answers in place of the
  outside service that a connector's tool reaches.
- A fault point is a named place in the server. An action or a step that reaches an armed fault
  point reports its arrival and waits there until the test releases it or kills nixie.
  [Crash tests](../../../../docs/architecture/core/crash-tests.md) lists the fault points.
- Each start of nixie runs one action of its own, on the `queue-check` thread, to check its action
  queue. That action stops at every armed action fault point. Arm a fault point only after the queue
  check ends, or the fault point traps the queue check's action in place of yours.
- Inside the test bundle, nixie reads the harness clock. The clock moves only when the test calls
  `nixie.harness.advance`. The test process keeps real time.

Write a crash suite in this order. [`retry.test.ts`](../../../../e2e/crash/retry.test.ts) shows the
arguments of each call.

1. Assign the result of `startSpawnedNixie()` to `nixie`.
2. Start the child process with `nixie.harness.start()`, and await its `ready`.
3. Await `nixie.waitForQueueCheck()`.
4. Arm a fault point with `child.request('arm', { point, kind: 'action' })`.
5. Script the model with `nixie.model.addReplies`, such as a call to the test connector's
   `test_send` tool, which queues an action.
6. Send a message with `child.request('sendMessage', { thread, text })`.
7. Await `child.waitForArrival(point)`. Then await `child.kill()`.
8. Start a new child process with `nixie.harness.start()`, and await its `ready`. Repeat step 3
   before you arm anything.
9. Read nixie's records with `nixie.readRecords()` or `nixie.waitForRecord()`, and assert on them.
   Match only the records whose `thread` is your suite's, because the queue check writes records
   too.
