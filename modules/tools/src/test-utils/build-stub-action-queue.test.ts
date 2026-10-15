import { expect, test } from 'bun:test';
import { buildStubActionQueue } from './build-stub-action-queue';

test('it gives each new action its own ID and holds the action under it', async () => {
  const stub = buildStubActionQueue();

  const first = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  const second = await stub.queue.enqueue({
    call: { callID: 'call-2', tool: 'test.send', input: { to: 'b' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 3,
  });

  expect(first).not.toBe(second);

  expect(stub.actions.map((entry) => [entry.actionID, entry.action.callSequence])).toStrictEqual([
    [first, 1],
    [second, 3],
  ]);
});

test("it gives a repeat of an earlier action's tool and input that action's ID", async () => {
  const stub = buildStubActionQueue();

  const first = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  const repeat = await stub.queue.enqueue({
    call: { callID: 'call-2', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-2',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 5,
  });

  expect(repeat).toBe(first);
  expect(stub.actions).toHaveLength(1);
});

test("it gives another task's call with the same tool and input its own ID", async () => {
  const stub = buildStubActionQueue();

  const first = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  const other = await stub.queue.enqueue({
    call: { callID: 'call-2', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-2',
      thread: 'task-2',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 5,
  });

  expect(other).not.toBe(first);
  expect(stub.actions).toHaveLength(2);
});

test('it answers a pending wait with the outcome written for its action', async () => {
  const stub = buildStubActionQueue();

  const actionID = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  const wait = stub.queue.waitForOutcome(actionID, 10_000);

  stub.writeOutcome(actionID, { outcome: 'done', result: { delivered: true } });

  expect(wait).resolves.toStrictEqual({ outcome: 'done', result: { delivered: true } });
});

test('it answers a wait that starts after the action settled with its outcome', async () => {
  const stub = buildStubActionQueue();

  const actionID = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  stub.writeOutcome(actionID, { outcome: 'failed', reason: 'the provider refused it' });

  const outcome = await stub.queue.waitForOutcome(actionID, 10_000);

  expect(outcome).toStrictEqual({ outcome: 'failed', reason: 'the provider refused it' });
});

test('it ends a pending wait with null once the waits drain', async () => {
  const stub = buildStubActionQueue();

  const actionID = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  const wait = stub.queue.waitForOutcome(actionID, 10_000);

  stub.drainWaits();

  expect(wait).resolves.toBeNull();
});

test('it records each wait with the timeout it was given', async () => {
  const stub = buildStubActionQueue();

  const actionID = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  stub.writeOutcome(actionID, { outcome: 'done', result: {} });

  await stub.queue.waitForOutcome(actionID, 250);

  expect(stub.waits).toStrictEqual([{ actionID, timeoutMs: 250 }]);
});

test('it rejects a wait for an action it never queued', () => {
  const stub = buildStubActionQueue();

  expect(stub.queue.waitForOutcome('action-404', 10_000)).rejects.toThrowWithMessage(
    Error,
    'the action queue holds no action action-404',
  );
});

test('it rejects a pending wait once stopped', async () => {
  const stub = buildStubActionQueue();

  const actionID = await stub.queue.enqueue({
    call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
    run: {
      runID: 'run-1',
      thread: 'task-1',
      tools: ['test.send'],
      model: { model: 'm', profile: 'p' },
    },
    decision: { outcome: 'allow', stage: 3, rule: null },
    callSequence: 1,
  });

  const wait = stub.queue.waitForOutcome(actionID, 10_000);

  stub.stop();

  expect(wait).rejects.toThrowWithMessage(Error, 'the action queue stopped');
});

test('it rejects an action queued once stopped', () => {
  const stub = buildStubActionQueue();

  stub.stop();

  expect(
    stub.queue.enqueue({
      call: { callID: 'call-1', tool: 'test.send', input: { to: 'a' }, toolUseID: null },
      run: {
        runID: 'run-1',
        thread: 'task-1',
        tools: ['test.send'],
        model: { model: 'm', profile: 'p' },
      },
      decision: { outcome: 'allow', stage: 3, rule: null },
      callSequence: 1,
    }),
  ).rejects.toThrowWithMessage(Error, 'the action queue stopped');
});
