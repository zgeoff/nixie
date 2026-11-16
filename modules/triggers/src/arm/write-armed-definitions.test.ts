import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { buildTestArmedDefinition, readTestTriggerRows, startTestTriggers } from '../test-utils';
import type { ArmedDefinition } from '../types';
import { writeArmedDefinitions } from './write-armed-definitions';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    writeArmed: (inForce: readonly ArmedDefinition[]) =>
      withWriteTransaction(triggers.writer, (tx) =>
        writeArmedDefinitions(tx, triggers.context, inForce),
      ),
    readArmedRecords: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['trigger.armed'],
      });

      return records.map((entry) => entry.record.payload);
    },
  };
}

test('it writes one trigger.armed that holds each definition with no row', async () => {
  const ctx = await setupTest();

  const result = await ctx.writeArmed([
    buildTestArmedDefinition(),
    buildTestArmedDefinition({ definitionID: 'dentist', target: 'conversation' }),
  ]);

  const records = await ctx.readArmedRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ armed: 2, withdrawn: 0 });
  expect(records).toHaveLength(1);

  expect(
    rows.definitions.map((row) => [row.definition_id, row.definition_hash, row.target]),
  ).toStrictEqual([
    ['dentist', 'hash-1', 'conversation'],
    ['water-the-tomatoes', 'hash-1', 'task'],
  ]);
});

test('it writes no record when the definitions match the rows', async () => {
  const ctx = await setupTest();

  await ctx.writeArmed([buildTestArmedDefinition()]);

  const result = await ctx.writeArmed([buildTestArmedDefinition()]);
  const records = await ctx.readArmedRecords();

  expect(result).toStrictEqual({ armed: 0, withdrawn: 0 });
  expect(records).toHaveLength(1);
});

test('it leaves the watermark where it was when only the hash changes', async () => {
  const ctx = await setupTest();

  await ctx.writeArmed([buildTestArmedDefinition()]);

  ctx.clock.advance(3_600_000);

  const result = await ctx.writeArmed([buildTestArmedDefinition({ definitionHash: 'hash-2' })]);
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ armed: 1, withdrawn: 0 });

  expect(rows.definitions.map((row) => [row.definition_hash, row.after])).toStrictEqual([
    ['hash-2', Date.parse('2027-03-09T00:00:00Z')],
  ]);
});

test('it moves the watermark to the record time when the trigger changes', async () => {
  const ctx = await setupTest();

  await ctx.writeArmed([buildTestArmedDefinition()]);

  ctx.clock.advance(3_600_000);

  await ctx.writeArmed([
    buildTestArmedDefinition({
      definitionHash: 'hash-2',
      trigger: triggerSchema.parse({
        schedule: { every: 'day', at: '09:00', zone: 'Australia/Sydney' },
      }),
    }),
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.after)).toStrictEqual([
    Date.parse('2027-03-09T01:00:00Z'),
  ]);
});

test('it withdraws each armed definition that the list leaves out', async () => {
  const ctx = await setupTest();

  await ctx.writeArmed([buildTestArmedDefinition()]);

  const result = await ctx.writeArmed([]);
  const records = await ctx.readArmedRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ armed: 0, withdrawn: 1 });
  expect(records.at(-1)).toStrictEqual({ armed: [], withdrawn: ['water-the-tomatoes'] });
  expect(rows.definitions.map((row) => row.definition_hash)).toStrictEqual([null]);
});

test('it writes nothing for a definition that is withdrawn and still out of force', async () => {
  const ctx = await setupTest();

  await ctx.writeArmed([buildTestArmedDefinition()]);
  await ctx.writeArmed([]);

  const result = await ctx.writeArmed([]);

  expect(result).toStrictEqual({ armed: 0, withdrawn: 0 });
});

test('it arms a withdrawn definition again and moves its watermark', async () => {
  const ctx = await setupTest();

  await ctx.writeArmed([buildTestArmedDefinition()]);
  await ctx.writeArmed([]);

  ctx.clock.advance(7_200_000);

  const result = await ctx.writeArmed([buildTestArmedDefinition()]);
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ armed: 1, withdrawn: 0 });

  expect(rows.definitions.map((row) => [row.definition_hash, row.after])).toStrictEqual([
    ['hash-1', Date.parse('2027-03-09T02:00:00Z')],
  ]);
});
