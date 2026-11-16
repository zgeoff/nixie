import { expect, test } from 'bun:test';
import { readTestTaskDefinitionExports } from './read-test-task-definition-exports';
import { startTestDefinitions } from './start-test-definitions';

test('it reads no export before one is recorded', async () => {
  const ctx = await startTestDefinitions();
  const rows = await readTestTaskDefinitionExports(ctx.writer);

  expect(rows).toStrictEqual([]);
});
