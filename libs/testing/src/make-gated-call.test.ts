import { expect, test } from 'bun:test';
import { makeGatedCall } from './make-gated-call';

test('it holds a call until the release, then returns what the wrapped call returns', async () => {
  const gated = makeGatedCall(() => 'done');
  const result = gated.call();

  await gated.started;
  const held = Bun.peek.status(result);

  gated.release();
  const returned = await result;

  expect(held).toBe('pending');
  expect(returned).toBe('done');
});

test('it passes the arguments through to the wrapped call', async () => {
  const gated = makeGatedCall((count: number, label: string) => `${label} ${count}`);

  gated.release();
  const returned = await gated.call(3, 'pages');

  expect(returned).toBe('pages 3');
});

test('it counts the calls running now and the most that ran at once', async () => {
  const gated = makeGatedCall(() => 'done');
  const calls = Promise.all([gated.call(), gated.call()]);

  await gated.started;
  const runningWhileHeld = gated.countRunning();

  gated.release();
  await calls;

  expect(runningWhileHeld).toBe(2);
  expect(gated.countRunning()).toBe(0);
  expect(gated.countMostRunning()).toBe(2);
});

test('it stops counting a call whose wrapped call rejects', () => {
  const gated = makeGatedCall(() => Promise.reject(new Error('impd is down')));

  gated.release();

  expect(gated.call()).rejects.toThrow('impd is down');
  expect(gated.countRunning()).toBe(0);
});

test('it waits the delay after the release before it calls through', async () => {
  const gated = makeGatedCall(() => Date.now(), { delayMs: 50 });

  gated.release();
  const releasedAt = Date.now();
  const calledAt = await gated.call();

  // Date.now() drops the fraction of a millisecond, so the two readings can sit 1 ms closer
  expect(calledAt).toBeGreaterThanOrEqual(releasedAt + 49);
});
