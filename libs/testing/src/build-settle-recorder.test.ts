import { expect, mock, test } from 'bun:test';
import { buildSettleRecorder } from './build-settle-recorder';

test('it records no settle while the wrapped call is still running', () => {
  const recorder = buildSettleRecorder(() => Promise.withResolvers<string>().promise);

  void recorder.check('impd');
  expect(recorder.settled).not.toHaveBeenCalled();
});

test('it records one settle before it returns the answer of a call that resolves', async () => {
  const recorder = buildSettleRecorder(() => Promise.resolve('impd answered'));

  const answer = await recorder.check('impd');

  expect(answer).toBe('impd answered');
  expect(recorder.settled).toHaveBeenCalledOnce();
});

test('it records one settle before it passes on the error of a call that rejects', async () => {
  const recorder = buildSettleRecorder(() =>
    Promise.reject(new TypeError('impd refused the call')),
  );

  const rejection = await recorder.check('impd').then(
    () => null,
    (error: unknown) => error,
  );

  expect(rejection).toBeInstanceOf(TypeError);
  expect(recorder.settled).toHaveBeenCalledOnce();
});

test('it passes its input to the wrapped call', async () => {
  const call = mock((input: string) => Promise.resolve(input.length));
  const recorder = buildSettleRecorder(call);

  await recorder.check('impd');

  expect(call).toHaveBeenCalledExactlyOnceWith('impd');
});
