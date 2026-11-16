import { expect, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import type { JSONValue } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import {
  claimTask,
  createConversationTask,
  readInbox,
  writeStepCommit,
  writeTaskControl,
} from '@heynixie/tasks';
import { seedDefinitionTask } from '@heynixie/tasks/test-utils';
import {
  buildTestArmedDefinition,
  buildTestTriggerEvent,
  readTestTriggerRows,
  seedArmedDefinitions,
  startTestTriggers,
} from '../test-utils';
import { deliverTriggerBatch } from './deliver-trigger-batch';

async function setupTest() {
  const triggers = await startTestTriggers();

  return {
    ...triggers,
    deliver: (events: Parameters<typeof buildTestTriggerEvent>[0][], cursor: JSONValue = null) =>
      deliverTriggerBatch(triggers.core, 'schedule', {
        cursor,
        events: events.map((event) => buildTestTriggerEvent(event)),
      }),
    deliverAs: (source: string, events: Parameters<typeof buildTestTriggerEvent>[0][]) =>
      deliverTriggerBatch(triggers.core, source, {
        cursor: null,
        events: events.map((event) => buildTestTriggerEvent(event)),
      }),
    readTriggerRecords: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['trigger.fired', 'trigger.skipped', 'trigger.armed', 'trigger.delivered'],
      });

      return records.map((entry) => ({
        kind: entry.record.kind,
        thread: entry.record.thread,
        payload: entry.record.payload,
      }));
    },
    readBindings: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['task.definition_set'],
      });

      return records.map((entry) => entry.record.payload);
    },
  };
}

test('it writes trigger.fired on the thread of the task and takes the key for a take answer', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  const records = await ctx.readTriggerRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ delivered: 1 });

  expect(records.filter((record) => record.kind === 'trigger.fired')).toStrictEqual([
    {
      kind: 'trigger.fired',
      thread: taskID,
      payload: {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        source: 'schedule',
        dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
        kind: 'schedule',
        scheduledFor: '2027-03-09T21:00:00.000Z',
        firedAt: '2027-03-09T00:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
  ]);

  expect(rows.keys.map((row) => row.source_key)).toStrictEqual([
    'schedule\nwater-the-tomatoes|2027-03-10T08:00',
  ]);
});

test('it writes trigger.fired on the conversation thread for a conversation target', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition({ target: 'conversation' })]);

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(result).toStrictEqual({ delivered: 1 });

  expect(
    records.filter((record) => record.kind === 'trigger.fired').map((record) => record.thread),
  ).toStrictEqual(['conversation']);
});

test('it writes trigger.skipped with the reason of an event that holds skip', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
      skip: 'catch_up_off',
    },
  ]);

  const records = await ctx.readTriggerRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ delivered: 1 });

  expect(records.filter((record) => record.kind === 'trigger.skipped')).toStrictEqual([
    {
      kind: 'trigger.skipped',
      thread: taskID,
      payload: {
        definitionID: 'water-the-tomatoes',
        source: 'schedule',
        dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
        scheduledFor: ['2027-03-09T21:00:00.000Z'],
        count: 1,
        reason: 'catch_up_off',
        recordedAt: '2027-03-09T00:00:00.000Z',
      },
    },
  ]);

  expect(rows.keys).toHaveLength(1);
});

test('it writes trigger.skipped with still_running for a second fire of one batch', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
    { scheduledFor: '2027-03-10T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-11T08:00' },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(result).toStrictEqual({ delivered: 2 });

  expect(
    records
      .filter((record) => record.kind !== 'trigger.armed')
      .map((record) => [record.kind, record.thread, record.payload['reason'] ?? null]),
  ).toStrictEqual([
    ['trigger.fired', taskID, null],
    ['trigger.skipped', taskID, 'still_running'],
  ]);
});

test('it writes trigger.skipped with task_held for a paused task, and fires at the next slot after a resume', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);
  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  await ctx.deliver([
    { scheduledFor: '2027-03-10T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-11T08:00' },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records
      .filter((record) => record.kind !== 'trigger.armed')
      .map((record) => [
        record.kind,
        record.payload['dedupeKey'],
        record.payload['reason'] ?? null,
      ]),
  ).toStrictEqual([
    ['trigger.skipped', 'water-the-tomatoes|2027-03-10T08:00', 'task_held'],
    ['trigger.fired', 'water-the-tomatoes|2027-03-11T08:00', null],
  ]);
});

test('it skips with still_running at each next slot while one fire waits unread beside an idle task run', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    policy: { wakeable: true },
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([{ scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'k-1' }]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null) {
    throw new Error('the fire is claimable');
  }

  const [fired] = await readInbox(ctx.context, taskID);

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [fired?.sequence ?? 0],
  });

  await ctx.deliver([{ scheduledFor: '2027-03-10T21:00:00.000Z', dedupeKey: 'k-2' }]);
  await ctx.deliver([{ scheduledFor: '2027-03-11T21:00:00.000Z', dedupeKey: 'k-3' }]);
  await ctx.deliver([{ scheduledFor: '2027-03-12T21:00:00.000Z', dedupeKey: 'k-4' }]);
  await ctx.deliver([{ scheduledFor: '2027-03-13T21:00:00.000Z', dedupeKey: 'k-5' }]);

  const records = await ctx.readTriggerRecords();
  const unread = await readInbox(ctx.context, taskID);

  expect(
    records
      .filter((record) => record.kind === 'trigger.skipped')
      .map((record) => [record.payload['dedupeKey'], record.payload['reason']]),
  ).toStrictEqual([
    ['k-3', 'still_running'],
    ['k-4', 'still_running'],
    ['k-5', 'still_running'],
  ]);

  expect(unread.filter((record) => record.kind === 'trigger.fired')).toHaveLength(1);
});

test('it writes nothing for an event whose key an earlier delivery took', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(result).toStrictEqual({ delivered: 0 });
  expect(records).toHaveLength(2);
});

test('it writes one record for 2 events of one batch that share a key', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  expect(result).toStrictEqual({ delivered: 1 });
});

test('it writes nothing for a definition with no row', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it writes nothing for a withdrawn definition', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);
  await seedArmedDefinitions(ctx, []);

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it writes nothing for a definition that another source holds', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.deliverAs('poll', [
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it writes nothing for an event that holds another hash than the row', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.deliver([
    {
      definitionHash: 'hash-0',
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it writes nothing for a schedule event at or before the watermark', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const result = await ctx.deliver([
    { scheduledFor: '2027-03-09T00:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it commits nothing when the definition has no task', async () => {
  const ctx = await setupTest();

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const delivery = ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  await Promise.allSettled([delivery]);

  const records = await ctx.readTriggerRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(delivery).rejects.toThrow(/no task/u);
  expect(records.map((record) => record.kind)).toStrictEqual(['trigger.armed']);
  expect(rows.keys).toStrictEqual([]);
});

test('it marks a fire more than 60 seconds after its slot as a catch-up', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  ctx.clock.advance(Date.parse('2027-03-09T21:00:00.000Z') - ctx.clock.now() + 90_000);

  await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records.filter((record) => record.kind === 'trigger.fired').map((record) => record.payload),
  ).toMatchObject([{ isCatchUp: true, firedAt: '2027-03-09T21:01:30.000Z' }]);
});

test('it marks a fire 60 seconds after its slot as no catch-up', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  ctx.clock.advance(Date.parse('2027-03-09T21:00:00.000Z') - ctx.clock.now() + 60_000);

  await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records.filter((record) => record.kind === 'trigger.fired').map((record) => record.payload),
  ).toMatchObject([{ isCatchUp: false }]);
});

test('it carries the missed slots of an event into its fire', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([
    {
      scheduledFor: '2027-03-10T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-11T08:00',
      missed: ['2027-03-09T21:00:00.000Z'],
      missedCount: 3,
    },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records.filter((record) => record.kind === 'trigger.fired').map((record) => record.payload),
  ).toMatchObject([{ skipped: ['2027-03-09T21:00:00.000Z'], skippedCount: 3 }]);
});

test('it lists the 20 newest slots of a skip that covers 25 missed ones', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const missed = Array.from(
    { length: 25 },
    (_, index) => `2027-03-09T10:${String(index).padStart(2, '0')}:00.000Z`,
  );

  await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
      skip: 'too_late',
      missed,
      missedCount: 25,
    },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records.filter((record) => record.kind === 'trigger.skipped').map((record) => record.payload),
  ).toMatchObject([{ scheduledFor: [...missed.slice(6), '2027-03-09T21:00:00.000Z'], count: 26 }]);
});

test('it withdraws a one-shot and clears the hash of its task in the transaction of its fire', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'dentist',
    definitionHash: 'hash-9',
  });

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

  const records = await ctx.readTriggerRecords();
  const rows = await readTestTriggerRows(ctx);
  const bindings = await ctx.readBindings();

  expect(records.slice(1).map((record) => [record.kind, record.thread])).toStrictEqual([
    ['trigger.fired', taskID],
    ['trigger.armed', null],
  ]);

  expect(records[2]?.payload).toStrictEqual({ armed: [], withdrawn: ['dentist'] });
  expect(rows.definitions.map((row) => row.definition_hash)).toStrictEqual([null]);
  expect(bindings.at(-1)).toMatchObject({ definitionID: 'dentist', definitionHash: null });
});

test('it withdraws a one-shot whose fire was skipped', async () => {
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
      skip: 'too_late',
      scheduledFor: '2027-03-09T16:00:00.000Z',
      dedupeKey: 'dentist|2027-03-09T16:00:00.000Z',
    },
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect(rows.definitions.map((row) => row.definition_hash)).toStrictEqual([null]);
});

test('it stores the cursor of a batch once, and writes none for the same cursor again', async () => {
  const ctx = await setupTest();

  await ctx.deliver([], { since: 'a', page: 2 });
  await ctx.deliver([], { page: 2, since: 'a' });

  const records = await ctx.readTriggerRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(records.filter((record) => record.kind === 'trigger.delivered')).toHaveLength(1);
  expect(rows.sources.map((row) => row.cursor)).toStrictEqual(['{"since":"a","page":2}']);
});

test('it writes no cursor record for a missing row and a null cursor', async () => {
  const ctx = await setupTest();

  await ctx.deliver([], null);

  const records = await ctx.readTriggerRecords();

  expect(records).toStrictEqual([]);
});
