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
import { readDefinitionNextFire } from './read-definition-next-fire';

async function setupTest() {
  const triggers = await startTestTriggers();

  const zones: string[] = [];

  return {
    ...triggers,
    zones,
    readDefinitionNextFire: (definitionID: string) =>
      readDefinitionNextFire(
        triggers.writer.db,
        (zone) => {
          zones.push(zone ?? '');

          const resolved = zone === 'owner' ? 'Australia/Sydney' : (zone ?? '');

          return Promise.resolve(resolved);
        },
        definitionID,
      ),
  };
}

test('it gives the next slot of a scheduled definition as an ISO instant in UTC', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.readDefinitionNextFire('water-the-tomatoes');

  expect(result).toBe('2027-03-09T21:00:00.000Z');
});

test('it resolves the zone of the schedule through the reader', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [
    buildTestArmedDefinition({
      trigger: triggerSchema.parse({ schedule: { every: 'day', at: '08:00' } }),
    }),
  ]);

  const result = await ctx.readDefinitionNextFire('water-the-tomatoes');

  expect([result, ctx.zones]).toStrictEqual(['2027-03-09T21:00:00.000Z', ['owner']]);
});

test('it gives a slot that is already past', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  ctx.clock.advance(10 * 86_400_000);

  const result = await ctx.readDefinitionNextFire('water-the-tomatoes');

  expect(result).toBe('2027-03-09T21:00:00.000Z');
});

test('it gives null for a definition with no row', async () => {
  const ctx = await setupTest();
  const result = await ctx.readDefinitionNextFire('water-the-tomatoes');

  expect(result).toBeNull();
});

test('it gives null for a withdrawn definition', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);
  await seedArmedDefinitions(ctx, []);

  const result = await ctx.readDefinitionNextFire('water-the-tomatoes');

  expect(result).toBeNull();
});

test('it gives the instant of a one-shot that has not fired', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [
    buildTestArmedDefinition({
      definitionID: 'dentist',
      trigger: triggerSchema.parse({ at: '2027-03-10T03:00:00+11:00' }),
    }),
  ]);

  const result = await ctx.readDefinitionNextFire('dentist');

  expect([result, ctx.zones]).toStrictEqual(['2027-03-09T16:00:00.000Z', ['owner']]);
});

test('it gives null for a one-shot that fired', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'dentist', definitionHash: 'hash-1' });

  await seedArmedDefinitions(ctx, [
    buildTestArmedDefinition({
      definitionID: 'dentist',
      trigger: triggerSchema.parse({ at: '2027-03-10T03:00:00+11:00' }),
    }),
  ]);

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

  const result = await ctx.readDefinitionNextFire('dentist');

  expect(result).toBeNull();
});
