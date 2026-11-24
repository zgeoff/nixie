import { expect, test } from 'bun:test';
import { waitForModelInput } from './wait-for-model-input';

test('#waitForModelInput returns the input once it holds the text', async () => {
  const texts = ['null', '{"exitCode":0}'];

  const input = await waitForModelInput(() => Promise.resolve({ text: texts.shift() ?? '' }), {
    contains: 'exitCode',
  });

  expect(input).toStrictEqual({ text: '{"exitCode":0}' });
});

test('#waitForModelInput fails with check-failed when the text never comes', () => {
  const result = waitForModelInput(() => Promise.resolve({ text: 'null' }), {
    contains: 'exitCode',
    waitMs: 1,
  });

  expect(result).rejects.toMatchObject({ code: 'check-failed' });
});
