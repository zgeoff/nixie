import { expect, test } from 'bun:test';
import { buildStubCheck } from './build-stub-check';

test('it answers each call with the answer it was built with', async () => {
  const stub = buildStubCheck(() => Promise.resolve({ isReady: true, reason: null }));

  const report = await stub.check();

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it answers every call after a swap with the new answer', async () => {
  const stub = buildStubCheck<{ readonly isReady: boolean; readonly reason: string | null }>(() =>
    Promise.resolve({ isReady: true, reason: null }),
  );

  stub.answerWith(() => Promise.resolve({ isReady: false, reason: 'the data volume is 95% full' }));

  const first = await stub.check();
  const second = await stub.check();

  expect(first).toStrictEqual({ isReady: false, reason: 'the data volume is 95% full' });
  expect(second).toStrictEqual({ isReady: false, reason: 'the data volume is 95% full' });
});

test('it rejects a call when the answer it holds rejects', () => {
  const stub = buildStubCheck(() => Promise.reject(new TypeError('impd refused the call')));

  expect(stub.check()).rejects.toThrow(TypeError);
});

test('it records each call', async () => {
  const stub = buildStubCheck(() => Promise.resolve({ isReady: true, reason: null }));

  await stub.check();
  await stub.check();

  expect(stub.check).toHaveBeenCalledTimes(2);
});
