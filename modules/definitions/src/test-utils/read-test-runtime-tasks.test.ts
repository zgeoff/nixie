import { expect, test } from 'bun:test';
import { readTestRuntimeTasks } from './read-test-runtime-tasks';
import { startTestDefinitions } from './start-test-definitions';

test('it reads no runtime change before one is made', async () => {
  const ctx = await startTestDefinitions();
  const rows = await readTestRuntimeTasks(ctx.writer);

  expect(rows).toStrictEqual([]);
});
