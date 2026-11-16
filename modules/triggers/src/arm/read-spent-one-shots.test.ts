import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import { seedDefinitionTask } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestArmedDefinition,
  buildTestTriggerEvent,
  seedArmedDefinitions,
  startTestTriggers,
} from '../test-utils';
import { readSpentOneShots } from './read-spent-one-shots';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    readSpent: (candidates: Parameters<typeof readSpentOneShots>[1]) =>
      readSpentOneShots(triggers.writer.db, candidates),
  };
}

test('it finds a one-shot whose key trigger_keys holds', async () => {
  const ctx = await setupTest();

  const trigger = triggerSchema.parse({ at: '2027-03-10T03:00:00+11:00' });

  await seedDefinitionTask(ctx, { definitionID: 'dentist', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition({ definitionID: 'dentist', trigger })]);

  await deliverTriggerBatch(ctx.core, 'schedule', {
    cursor: null,
    events: [
      buildTestTriggerEvent({
        definitionID: 'dentist',
        kind: 'at',
        scheduledFor: '2027-03-09T16:00:00.000Z',
        dedupeKey: 'dentist|2027-03-09T16:00:00.000Z',
      }),
    ],
  });

  const spent = await ctx.readSpent([{ definitionID: 'dentist', trigger }]);

  expect([...spent]).toStrictEqual(['dentist']);
});

test('it leaves a one-shot whose key is not taken', async () => {
  const ctx = await setupTest();

  const spent = await ctx.readSpent([
    { definitionID: 'dentist', trigger: triggerSchema.parse({ at: '2027-03-10T03:00:00+11:00' }) },
  ]);

  expect([...spent]).toStrictEqual([]);
});

test('it never counts a schedule as spent', async () => {
  const ctx = await setupTest();

  const spent = await ctx.readSpent([
    {
      definitionID: 'water-the-tomatoes',
      trigger: triggerSchema.parse({ schedule: { every: 'day', at: '08:00' } }),
    },
  ]);

  expect([...spent]).toStrictEqual([]);
});
