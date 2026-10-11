import { expect, test } from 'bun:test';
import { startHarnessLink } from './start-harness-link';
import type { HarnessMessage, NixieMessage } from './types';
import { waitForCondition } from './wait-for-condition';

// a link on an in-memory channel: what nixie sent, and a way to send it a harness message
function setupTest(env: Readonly<Record<string, string>>) {
  const sent: NixieMessage[] = [];
  const listeners: ((message: HarnessMessage) => void)[] = [];
  const link = startHarnessLink(env, {
    send: (message) => {
      sent.push(message);
    },
    subscribe: (onMessage) => {
      listeners.push(onMessage);
    },
  });

  return {
    link,
    sent,
    sendToLink: (message: HarnessMessage) => {
      for (const listener of listeners) {
        listener(message);
      }
    },
  };
}

test('it starts the clock at the time the harness passed', () => {
  const ctx = setupTest({ NIXIE_TEST_CLOCK_MS: '1000000' });

  expect(ctx.link.clock.now()).toBe(1_000_000);
});

test('it passes a fault point that no arm names at once, and sends nothing', async () => {
  const ctx = setupTest({ NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after"}]' });

  await ctx.link.waitAtFaultPoint('step.commit.before', { kind: 'task', id: 'task-1' });

  expect(ctx.sent).toStrictEqual([]);
});

test('it holds an armed fault point until the harness releases the arrival', async () => {
  const ctx = setupTest({ NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after"}]' });

  const held = ctx.link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'task-1' });

  await waitForCondition(() => ctx.sent.length === 1);

  const statusBeforeRelease = Bun.peek.status(held);

  ctx.sendToLink({ type: 'release', arrivalID: 1 });

  await expect(held).toResolve();
  expect(statusBeforeRelease).toBe('pending');
  expect(ctx.sent).toStrictEqual([
    { type: 'arrived', arrivalID: 1, point: 'claim.after', work: { kind: 'task', id: 'task-1' } },
  ]);
});

test('it holds an arm only as many times as it names', async () => {
  const ctx = setupTest({ NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after","times":1}]' });

  void ctx.link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'task-1' });
  await ctx.link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'task-2' });

  expect(ctx.sent).toHaveLength(1);
});

test('it holds only the work of the kind and the ID an arm names', async () => {
  const ctx = setupTest({
    NIXIE_TEST_FAULT_POINTS: '[{"point":"claim.after","kind":"action","workID":"action-1"}]',
  });

  await ctx.link.waitAtFaultPoint('claim.after', { kind: 'task', id: 'action-1' });
  await ctx.link.waitAtFaultPoint('claim.after', { kind: 'action', id: 'action-2' });
  void ctx.link.waitAtFaultPoint('claim.after', { kind: 'action', id: 'action-1' });

  expect(ctx.sent).toStrictEqual([
    {
      type: 'arrived',
      arrivalID: 1,
      point: 'claim.after',
      work: { kind: 'action', id: 'action-1' },
    },
  ]);
});

test('it holds a fault point the harness arms after start', async () => {
  const ctx = setupTest({});

  ctx.sendToLink({
    type: 'request',
    requestID: 1,
    operation: 'arm',
    args: { point: 'renew.after' },
  });
  await waitForCondition(() => ctx.sent.length === 1);
  void ctx.link.waitAtFaultPoint('renew.after', { kind: 'task', id: 'task-1' });

  expect(ctx.sent).toStrictEqual([
    { type: 'reply', requestID: 1, result: null },
    { type: 'arrived', arrivalID: 1, point: 'renew.after', work: { kind: 'task', id: 'task-1' } },
  ]);
});

test('it advances the clock and wakes its sleepers for an advance', async () => {
  const ctx = setupTest({ NIXIE_TEST_CLOCK_MS: '0' });
  const sleep = ctx.link.clock.sleep(5000);

  ctx.sendToLink({ type: 'request', requestID: 1, operation: 'advance', args: { ms: 5000 } });

  await expect(sleep).toResolve();
  expect(ctx.link.clock.now()).toBe(5000);
});

test('it reports an advance settled once every sleeper it woke sleeps again', async () => {
  const ctx = setupTest({ NIXIE_TEST_CLOCK_MS: '0' });

  // a poll loop that sleeps again each time it wakes
  void (async () => {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a poll
      await ctx.link.clock.sleep(1000);
    }
  })();
  ctx.sendToLink({
    type: 'request',
    requestID: 1,
    operation: 'advance',
    args: { ms: 1000, settle: true },
  });
  await waitForCondition(() => ctx.sent.length === 1);

  expect(ctx.sent).toStrictEqual([{ type: 'reply', requestID: 1, result: { settled: true } }]);
});

test('it runs a registered operation and replies with its result', async () => {
  const ctx = setupTest({});

  ctx.link.registerOperation('double', (args) => Number(args) * 2);
  ctx.sendToLink({ type: 'request', requestID: 7, operation: 'double', args: 21 });
  await waitForCondition(() => ctx.sent.length === 1);

  expect(ctx.sent).toStrictEqual([{ type: 'reply', requestID: 7, result: 42 }]);
});

test('it replies with the error of an operation that throws', async () => {
  const ctx = setupTest({});

  ctx.link.registerOperation('fail', () => {
    throw new Error('the operation failed');
  });
  ctx.sendToLink({ type: 'request', requestID: 2, operation: 'fail', args: null });
  await waitForCondition(() => ctx.sent.length === 1);

  expect(ctx.sent).toStrictEqual([{ type: 'reply', requestID: 2, error: 'the operation failed' }]);
});

test('it replies with an error to an operation it does not have', async () => {
  const ctx = setupTest({});

  ctx.sendToLink({ type: 'request', requestID: 3, operation: 'nope', args: null });
  await waitForCondition(() => ctx.sent.length === 1);

  expect(ctx.sent).toStrictEqual([
    { type: 'reply', requestID: 3, error: 'nixie has no harness operation nope' },
  ]);
});

test('it tells the harness when nixie is ready', () => {
  const ctx = setupTest({});

  ctx.link.sendReady();

  expect(ctx.sent).toStrictEqual([{ type: 'ready' }]);
});
