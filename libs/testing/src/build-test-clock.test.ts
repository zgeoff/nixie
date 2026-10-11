import { expect, test } from 'bun:test';
import { buildTestClock } from './build-test-clock';

test('it starts at the given time and moves only on advance', () => {
  const clock = buildTestClock(1000);

  clock.advance(250);

  expect(clock.now()).toBe(1250);
});

test('it keeps a sleeper asleep until an advance reaches its due time', () => {
  const clock = buildTestClock(0);

  void clock.sleep(20_000);
  clock.advance(19_999);

  expect(clock.countSleepers()).toBe(1);
});

test('it wakes a sleeper once an advance reaches its due time', async () => {
  const clock = buildTestClock(0);

  const sleep = clock.sleep(20_000);

  clock.advance(20_000);

  await expect(sleep).toResolve();
  expect(clock.countSleepers()).toBe(0);
});

test('it wakes sleepers earliest first', async () => {
  const clock = buildTestClock(0);
  const woken: string[] = [];
  const waitAndRecord = async (name: string, ms: number): Promise<void> => {
    await clock.sleep(ms);
    woken.push(name);
  };

  const late = waitAndRecord('late', 300);
  const early = waitAndRecord('early', 100);

  clock.advance(500);
  await Promise.all([late, early]);

  expect(woken).toStrictEqual(['early', 'late']);
});

test('it ends a sleep at once when its signal aborts', async () => {
  const clock = buildTestClock(0);
  const controller = new AbortController();

  const sleep = clock.sleep(60_000, controller.signal);

  controller.abort();

  await expect(sleep).toResolve();
  expect(clock.countSleepers()).toBe(0);
});

test('it ends a sleep at once when its signal has already aborted', async () => {
  const clock = buildTestClock(0);

  await expect(clock.sleep(60_000, AbortSignal.abort())).toResolve();
});

test('it ends a sleep of no time at once', async () => {
  const clock = buildTestClock(0);

  await expect(clock.sleep(0)).toResolve();
});

test('it counts the sleeps still waiting', () => {
  const clock = buildTestClock(0);

  void clock.sleep(10);
  void clock.sleep(20);
  clock.advance(10);

  expect(clock.countSleepers()).toBe(1);
});
