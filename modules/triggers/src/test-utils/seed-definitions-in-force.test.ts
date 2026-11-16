import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import { seedDefinitionTask } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import { buildTestArmedDefinition } from './build-test-armed-definition';
import { buildTestTriggerEvent } from './build-test-trigger-event';
import { readTestTriggerRows } from './read-test-trigger-rows';
import { seedDefinitionsInForce } from './seed-definitions-in-force';
import { startTestTriggers } from './start-test-triggers';

test('it arms a definition whose trigger has not fired', async () => {
  const triggers = await startTestTriggers();

  await seedDefinitionsInForce(triggers, [buildTestArmedDefinition()]);

  const rows = await readTestTriggerRows(triggers);

  expect(rows.definitions.map((row) => [row.definition_id, row.definition_hash])).toStrictEqual([
    ['water-the-tomatoes', 'hash-1'],
  ]);
});

test('it leaves out a one-shot whose key is taken', async () => {
  const triggers = await startTestTriggers();

  const at = '2027-03-09T10:00:00.000Z';

  await seedDefinitionTask(triggers, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedDefinitionsInForce(triggers, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at }) }),
  ]);

  await deliverTriggerBatch(triggers.core, 'schedule', {
    cursor: null,
    events: [
      buildTestTriggerEvent({
        kind: 'at',
        dedupeKey: `water-the-tomatoes|${at}`,
        scheduledFor: at,
      }),
    ],
  });

  await seedDefinitionsInForce(triggers, [
    buildTestArmedDefinition({ trigger: triggerSchema.parse({ at }) }),
  ]);

  const rows = await readTestTriggerRows(triggers);

  expect(rows.definitions.map((row) => row.definition_hash)).toStrictEqual([null]);
});
