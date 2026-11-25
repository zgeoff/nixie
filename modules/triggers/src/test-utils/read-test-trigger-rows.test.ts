import { expect, test } from 'bun:test';
import { readTestTriggerRows } from './read-test-trigger-rows';
import { startTestTriggers } from './start-test-triggers';

test('it reads empty tables from a new log', async () => {
  const triggers = await startTestTriggers();
  const rows = await readTestTriggerRows(triggers);

  expect(rows).toStrictEqual({
    keys: [],
    sources: [],
    definitions: [],
    held: [],
    windows: [],
  });
});
