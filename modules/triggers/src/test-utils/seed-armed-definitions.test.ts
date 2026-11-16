import { expect, test } from 'bun:test';
import { buildTestArmedDefinition } from './build-test-armed-definition';
import { readTestTriggerRows } from './read-test-trigger-rows';
import { seedArmedDefinitions } from './seed-armed-definitions';
import { startTestTriggers } from './start-test-triggers';

test('it arms the definitions that it is given', async () => {
  const triggers = await startTestTriggers();

  await seedArmedDefinitions(triggers, [buildTestArmedDefinition({ definitionHash: 'hash-7' })]);

  const rows = await readTestTriggerRows(triggers);

  expect(rows.definitions.map((row) => [row.definition_id, row.definition_hash])).toStrictEqual([
    ['water-the-tomatoes', 'hash-7'],
  ]);
});

test('it withdraws an armed definition that the list leaves out', async () => {
  const triggers = await startTestTriggers();

  await seedArmedDefinitions(triggers, [buildTestArmedDefinition()]);
  await seedArmedDefinitions(triggers, []);

  const rows = await readTestTriggerRows(triggers);

  expect(rows.definitions.map((row) => row.definition_hash)).toStrictEqual([null]);
});
