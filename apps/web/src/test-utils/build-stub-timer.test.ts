import { expect, mock, test } from 'bun:test';
import { buildStubTimer } from './build-stub-timer';

test('it fires a timer once time reaches its due time', () => {
  const timer = buildStubTimer();
  const onTimeout = mock(() => {});

  timer.startTimer(onTimeout, 100);
  timer.advance(99);

  const calledEarly = onTimeout.mock.calls.length;

  timer.advance(1);

  expect(calledEarly).toBe(0);
  expect(onTimeout).toHaveBeenCalledOnce();
  expect(timer.countPending()).toBe(0);
});

test('it never fires a stopped timer', () => {
  const timer = buildStubTimer();
  const onTimeout = mock(() => {});
  const stop = timer.startTimer(onTimeout, 100);

  stop();

  timer.advance(200);

  expect(onTimeout).not.toHaveBeenCalled();
  expect(timer.countPending()).toBe(0);
});

test('it never fires a timer that an earlier callback in the same advance stopped', () => {
  const timer = buildStubTimer();
  const onLater = mock(() => {});
  const stopLater = timer.startTimer(onLater, 20);

  timer.startTimer(stopLater, 10);
  timer.advance(100);

  expect(onLater).not.toHaveBeenCalled();
  expect(timer.countPending()).toBe(0);
});

test('it fires a timer that a callback starts when its due time falls within the same advance', () => {
  const timer = buildStubTimer();
  const onSecond = mock(() => {});

  timer.startTimer(() => {
    timer.startTimer(onSecond, 10);
  }, 10);

  timer.advance(100);

  expect(onSecond).toHaveBeenCalledOnce();
  expect(timer.countPending()).toBe(0);
});

test('it starts a timer from a callback at the time the callback fired, not the advance target', () => {
  const timer = buildStubTimer();
  const onSecond = mock(() => {});

  timer.startTimer(() => {
    timer.startTimer(onSecond, 60);
  }, 50);

  timer.advance(100);

  const calledAtTarget = onSecond.mock.calls.length;

  timer.advance(10);

  expect(calledAtTarget).toBe(0);
  expect(onSecond).toHaveBeenCalledOnce();
});

test('it fires the earliest pending timer on advancing to the next, and resolves with its wait', async () => {
  const timer = buildStubTimer();
  const onEarly = mock(() => {});
  const onLate = mock(() => {});

  timer.startTimer(onLate, 50);
  timer.startTimer(onEarly, 30);

  const waited = await timer.advanceToNext();

  expect(waited).toBe(30);
  expect(onEarly).toHaveBeenCalledOnce();
  expect(onLate).not.toHaveBeenCalled();
});

test('it waits for a timer that starts after a promise settles before advancing to it', async () => {
  const timer = buildStubTimer();
  const onTimeout = mock(() => {});

  queueMicrotask(() => {
    timer.startTimer(onTimeout, 20);
  });

  const waited = await timer.advanceToNext();

  expect(waited).toBe(20);
  expect(onTimeout).toHaveBeenCalledOnce();
});

test('it measures the wait of the next timer from when it started, not from the start of time', () => {
  const timer = buildStubTimer();

  timer.advance(100);
  timer.startTimer(() => {}, 40);

  expect(timer.advanceToNext()).resolves.toBe(40);
});

test('it fires the due timers earliest first', () => {
  const timer = buildStubTimer();
  const fired: string[] = [];

  timer.startTimer(() => {
    fired.push('late');
  }, 50);

  timer.startTimer(() => {
    fired.push('early');
  }, 10);

  timer.startTimer(() => {
    fired.push('not due');
  }, 500);

  timer.advance(100);

  expect(fired).toStrictEqual(['early', 'late']);
  expect(timer.countPending()).toBe(1);
});
