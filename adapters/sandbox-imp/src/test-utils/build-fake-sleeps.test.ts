import { expect, mock, test } from 'bun:test';
import { buildFakeSleeps } from './build-fake-sleeps';

test('it holds a call until the idle sleep ends, then wakes the imp for that call only', async () => {
  const calls: string[] = [];
  const sleeps = buildFakeSleeps(calls);
  const snapshot = Promise.withResolvers<void>();

  void sleeps.startIdleSleep('nixie-a', snapshot.promise);

  const first = sleeps.waitForAwake('nixie-a', 'exec');
  const second = sleeps.waitForAwake('nixie-a', 'listen');

  snapshot.resolve();
  await Promise.all([first, second]);

  expect(calls).toStrictEqual([
    'idle-sleep nixie-a',
    'wait exec nixie-a',
    'wait listen nixie-a',
    'slept nixie-a',
    'woken by exec nixie-a',
  ]);
});

test('it lets a call through at once when no sleep holds the imp', async () => {
  const calls: string[] = [];
  const sleeps = buildFakeSleeps(calls);

  await sleeps.waitForAwake('nixie-a', 'exec');

  expect(calls).toStrictEqual([]);
});

test('it ends each listening forward of the imp as lost, and none that waits to listen', async () => {
  const sleeps = buildFakeSleeps([]);
  const listening = {
    listening: Promise.resolve(8901),
    ended: Promise.withResolvers<{ readonly kind: string }>().promise,
  };
  const waiting = { listening: Promise.withResolvers().promise, ended: listening.ended };
  const lost = { ...listening, stop: mock(), stopAsLost: mock() };
  const held = { ...waiting, stop: mock(), stopAsLost: mock() };

  sleeps.registerForward('nixie-a', lost);
  sleeps.registerForward('nixie-a', held);
  await sleeps.startIdleSleep('nixie-a', Promise.resolve());

  expect(lost.stopAsLost).toHaveBeenCalledOnce();
  expect(held.stopAsLost).not.toHaveBeenCalled();
});

test('it starts the sleep set for the next wake once, and none after it', async () => {
  const calls: string[] = [];
  const sleeps = buildFakeSleeps(calls);

  sleeps.sleepsAfterWake.set('nixie-a', Promise.resolve());
  sleeps.startSleepAfterWake('nixie-a');
  sleeps.startSleepAfterWake('nixie-a');
  await sleeps.waitForAwake('nixie-a', 'exec');

  expect(calls).toStrictEqual([
    'idle-sleep nixie-a',
    'wait exec nixie-a',
    'slept nixie-a',
    'woken by exec nixie-a',
  ]);
});
