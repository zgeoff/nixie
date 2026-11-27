import { expect, test } from 'bun:test';
import { buildTestTextSource } from './build-test-text-source';
import { startTestTriggers } from './start-test-triggers';

test('it holds fields for a text until a forget', async () => {
  const triggers = await startTestTriggers();

  const text = buildTestTextSource();

  const before = await text.source.readFields(triggers.core.log, 'tx1');

  text.forget();

  const after = await text.source.readFields(triggers.core.log, 'tx1');

  expect(before).toStrictEqual({ from: 'Example', body: 'Your code is 5521' });
  expect(after).toBeNull();
});
