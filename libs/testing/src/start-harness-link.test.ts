import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startHarnessLink } from './start-harness-link';
import { buildStubHarnessChannel } from './test-utils/build-stub-harness-channel';
import { waitForCondition } from './wait-for-condition';

test('it starts the clock at the time the harness passed', () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({ NIXIE_TEST_CLOCK_MS: '1000000' }, stub.channel);

  expect(link.clock.now()).toBe(1_000_000);
});

test('it passes a fault point that no arm names at once, and sends nothing', async () => {
  const stub = buildStubHarnessChannel();

  const link = startHarnessLink(
    { NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after"}]' },
    stub.channel,
  );

  await link.waitAtFaultPoint('step.commit.before', { kind: 'task', id: 'task-1' });

  expect(stub.sent).toStrictEqual([]);
});

test('it holds an armed fault point until the harness releases the arrival', async () => {
  const stub = buildStubHarnessChannel();

  const link = startHarnessLink(
    { NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after"}]' },
    stub.channel,
  );

  const held = link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'task-1' });

  await waitForCondition(() => stub.sent.length === 1);

  const statusBeforeRelease = Bun.peek.status(held);

  stub.sendToLink({ type: 'release', arrivalID: 1 });

  await expect(held).toResolve();

  expect(statusBeforeRelease).toBe('pending');

  expect(stub.sent).toStrictEqual([
    { type: 'arrived', arrivalID: 1, point: 'claim.after', work: { kind: 'task', id: 'task-1' } },
  ]);
});

test('it holds an arm only as many times as it names', async () => {
  const stub = buildStubHarnessChannel();

  const link = startHarnessLink(
    { NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after","times":1}]' },
    stub.channel,
  );

  void link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'task-1' });

  await link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'task-2' });

  expect(stub.sent).toHaveLength(1);
});

test('it holds only the work of the kind and the ID an arm names', async () => {
  const stub = buildStubHarnessChannel();

  const link = startHarnessLink(
    { NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after","kind":"action","workID":"action-1"}]' },
    stub.channel,
  );

  await link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'action-1' });
  await link.waitAtFaultPoint('claim.after', { kind: 'action', id: 'action-2' });

  void link.waitAtFaultPoint('claim.after', { kind: 'action', id: 'action-1' });

  expect(stub.sent).toStrictEqual([
    {
      type: 'arrived',
      arrivalID: 1,
      point: 'claim.after',
      work: { kind: 'action', id: 'action-1' },
    },
  ]);
});

test('it holds a fault point the harness arms after start', async () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({}, stub.channel);

  stub.sendToLink({
    type: 'request',
    requestID: 1,
    operation: 'arm',
    args: { point: 'renew.after' },
  });

  await waitForCondition(() => stub.sent.length === 1);

  void link.waitAtFaultPoint('renew.after', { kind: 'task', id: 'task-1' });

  expect(stub.sent).toStrictEqual([
    { type: 'reply', requestID: 1, result: null },
    { type: 'arrived', arrivalID: 1, point: 'renew.after', work: { kind: 'task', id: 'task-1' } },
  ]);
});

test('it advances the clock and wakes its sleepers for an advance', async () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({ NIXIE_TEST_CLOCK_MS: '0' }, stub.channel);
  const sleep = link.clock.sleep(5000);

  stub.sendToLink({ type: 'request', requestID: 1, operation: 'advance', args: { ms: 5000 } });

  await expect(sleep).toResolve();

  expect(link.clock.now()).toBe(5000);
});

test('it reports an advance settled once every sleeper it woke sleeps again', async () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({ NIXIE_TEST_CLOCK_MS: '0' }, stub.channel);

  // a poll loop that sleeps again each time it wakes
  void (async () => {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a poll
      await link.clock.sleep(1000);
    }
  })();

  stub.sendToLink({
    type: 'request',
    requestID: 1,
    operation: 'advance',
    args: { ms: 1000, settle: true },
  });

  await waitForCondition(() => stub.sent.length === 1);

  expect(stub.sent).toStrictEqual([{ type: 'reply', requestID: 1, result: { settled: true } }]);
});

test('it reports an advance unsettled when a sleeper it woke does not sleep again', async () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({ NIXIE_TEST_CLOCK_MS: '0' }, stub.channel);

  void link.clock.sleep(1000);

  stub.sendToLink({
    type: 'request',
    requestID: 1,
    operation: 'advance',
    args: { ms: 1000, settle: true, settleTimeoutMs: 50 },
  });

  await waitForCondition(() => stub.sent.length === 1);

  expect(stub.sent).toStrictEqual([{ type: 'reply', requestID: 1, result: { settled: false } }]);
});

test('it runs a registered operation and replies with its result', async () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({}, stub.channel);

  link.registerOperation('double', (args) => Number(args) * 2);
  stub.sendToLink({ type: 'request', requestID: 7, operation: 'double', args: 21 });

  await waitForCondition(() => stub.sent.length === 1);

  expect(stub.sent).toStrictEqual([{ type: 'reply', requestID: 7, result: 42 }]);
});

test('it replies with the error of an operation that throws', async () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({}, stub.channel);

  link.registerOperation('fail', () => {
    throw new Error('the operation failed');
  });

  stub.sendToLink({ type: 'request', requestID: 2, operation: 'fail', args: null });

  await waitForCondition(() => stub.sent.length === 1);

  expect(stub.sent).toStrictEqual([{ type: 'reply', requestID: 2, error: 'the operation failed' }]);
});

test('it replies with an error to an operation it does not have', async () => {
  const stub = buildStubHarnessChannel();

  startHarnessLink({}, stub.channel);

  stub.sendToLink({ type: 'request', requestID: 3, operation: 'nope', args: null });

  await waitForCondition(() => stub.sent.length === 1);

  expect(stub.sent).toStrictEqual([
    { type: 'reply', requestID: 3, error: 'nixie has no harness operation nope' },
  ]);
});

test('it tells the harness when nixie is ready', () => {
  const stub = buildStubHarnessChannel();
  const link = startHarnessLink({}, stub.channel);

  link.sendReady();

  expect(stub.sent).toStrictEqual([{ type: 'ready' }]);
});

test('it refuses to send when nixie runs without the crash harness IPC channel', async () => {
  const nixie = Bun.spawn(
    [process.execPath, join(import.meta.dir, 'test-utils/run-stub-nixie.ts')],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'pipe' },
  );

  onTestFinished(() => {
    nixie.kill('SIGKILL');
  });

  const stderr = await new Response(nixie.stderr).text();

  const code = await nixie.exited;

  expect(code).toBe(1);
  expect(stderr).toInclude('nixie runs without the crash harness IPC channel');
});
