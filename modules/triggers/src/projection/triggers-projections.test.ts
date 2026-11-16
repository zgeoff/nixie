import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import { seedDefinitionTask, writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestArmedDefinition,
  buildTestTriggerEvent,
  readTestTriggerRows,
  seedArmedDefinitions,
  startTestTriggers,
} from '../test-utils';
import { triggersProjections } from './triggers-projections';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    deliver: (events: Parameters<typeof buildTestTriggerEvent>[0][]) =>
      deliverTriggerBatch(triggers.core, 'schedule', {
        cursor: null,
        events: events.map((event) => buildTestTriggerEvent(event)),
      }),
  };
}

test('it lists the 3 projections by their tables', () => {
  expect(triggersProjections.map((projection) => projection.table)).toStrictEqual([
    'trigger_keys',
    'trigger_sources',
    'trigger_definitions',
  ]);
});

test('it sets the watermark of a new definition to the time of its arming', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.after)).toStrictEqual([
    Date.parse('2027-03-09T00:00:00Z'),
  ]);
});

test('it stores the trigger of a definition as canonical JSON', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.trigger)).toStrictEqual([
    '{"schedule":{"at":"08:00","catchUp":"once","every":"day","zone":"Australia/Sydney"}}',
  ]);
});

test('it moves the watermark of a schedule to the slot of its fire', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([{ scheduledFor: '2027-03-09T21:00:00.000Z' }]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.after)).toStrictEqual([
    Date.parse('2027-03-09T21:00:00Z'),
  ]);
});

test('it moves the watermark to the newest slot that a skip covers', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      missed: ['2027-03-09T10:00:00.000Z'],
      missedCount: 1,
      skip: 'too_late',
    },
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.after)).toStrictEqual([
    Date.parse('2027-03-09T21:00:00Z'),
  ]);
});

test('it never moves the watermark back', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([{ scheduledFor: '2027-03-20T21:00:00.000Z', dedupeKey: 'k-late' }]);

  await seedArmedDefinitions(ctx, [
    buildTestArmedDefinition({
      trigger: triggerSchema.parse({
        schedule: { every: 'day', at: '09:00', zone: 'Australia/Sydney' },
      }),
    }),
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.after)).toStrictEqual([
    Date.parse('2027-03-20T21:00:00Z'),
  ]);
});

test('it never moves the watermark of a one-shot', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'dentist', definitionHash: 'hash-9' });

  await seedArmedDefinitions(ctx, [
    buildTestArmedDefinition({
      definitionID: 'dentist',
      definitionHash: 'hash-9',
      trigger: triggerSchema.parse({ at: '2027-03-10T03:00:00+11:00' }),
    }),
  ]);

  await ctx.deliver([
    {
      definitionID: 'dentist',
      definitionHash: 'hash-9',
      kind: 'at',
      scheduledFor: '2027-03-09T16:00:00.000Z',
      dedupeKey: 'dentist|2027-03-09T16:00:00.000Z',
    },
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.after)).toStrictEqual([
    Date.parse('2027-03-09T00:00:00Z'),
  ]);
});

test('it fails the transaction that writes a dedupe key twice', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  const second = writeTestTriggerFire(ctx.context, taskID, { definitionHash: 'hash-1' });

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
});

test('it stores the cursor of a source', async () => {
  const ctx = await setupTest();

  await deliverTriggerBatch(ctx.core, 'poll', { cursor: { page: 2 }, events: [] });

  const rows = await readTestTriggerRows(ctx);

  expect(rows.sources.map((row) => [row.source_id, row.cursor])).toStrictEqual([
    ['poll', '{"page":2}'],
  ]);
});
