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
