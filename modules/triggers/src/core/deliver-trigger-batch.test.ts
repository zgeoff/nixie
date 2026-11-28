import { expect, onTestFinished, test } from 'bun:test';
import { triggerSchema } from '@heynixie/contract';
import type { JSONValue } from '@heynixie/log';
import {
  exemptTaskInTransaction,
  pauseNixieInTransaction,
  readRecords,
  withWriteTransaction,
} from '@heynixie/log';
import { buildLogSeeder } from '@heynixie/log/test-utils';
import {
  claimTask,
  createConversationTask,
  readInbox,
  readOpenRun,
  setFaultPointHandler,
  writeStepCommit,
  writeStepError,
  writeTaskControl,
} from '@heynixie/tasks';
import { buildTaskSeeder, readTestTasks, seedDefinitionTask } from '@heynixie/tasks/test-utils';
import {
  buildTestArmedDefinition,
  buildTestMailEvent,
  buildTestTriggerEvent,
  readTestTriggerRows,
  seedArmedDefinitions,
  seedWakeRule,
  startTestTriggers,
} from '../test-utils';
import type { TaskInputEvent } from '../types';
import { deliverTriggerBatch } from './deliver-trigger-batch';

async function setupTest() {
  const triggers = await startTestTriggers();

  const definitions = { snapshotHash: 'sha256:test' };

  return {
    ...triggers,
    seed: buildLogSeeder(triggers.context),
    pauseNixie: () =>
      withWriteTransaction(triggers.writer, (tx) =>
        pauseNixieInTransaction(tx, triggers.context.log, {
          cause: 'owner',
          recoveryID: null,
          by: 'session-a',
          definitions,
        }),
      ),
    exempt: (taskID: string) =>
      withWriteTransaction(triggers.writer, (tx) =>
        exemptTaskInTransaction(tx, triggers.context.log, { taskID, by: 'session-a', definitions }),
      ),
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
    taskSeed: buildTaskSeeder({ context: triggers.context }),
    deliverTaskInputs: (events: readonly TaskInputEvent[]) =>
      deliverTriggerBatch(triggers.core, 'coding', { cursor: null, events }),
    readTaskInputs: async () => {
      const records = await readRecords(triggers.context.log, {
        afterSequence: 0,
        kinds: ['trigger.task_input'],
      });

      return records.map((entry) => ({
        thread: entry.record.thread,
        payload: entry.record.payload,
        erasable: entry.record.erasable,
      }));
    },
    readTaskState: async (taskID: string) => {
      const tasks = await readTestTasks(triggers.writer);

      return tasks.find((task) => task.id === taskID)?.state;
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

test('it writes trigger.skipped with task_held, not too_late, for a late fire at a paused task', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);
  await writeTaskControl(ctx.context, { taskID, control: 'pause' });

  await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
      skip: 'too_late',
    },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records
      .filter((record) => record.kind === 'trigger.skipped')
      .map((record) => record.payload['reason']),
  ).toStrictEqual(['task_held']);
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

test('it reaches trigger.batch.before ahead of the write and trigger.batch.after behind it', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const reached: unknown[] = [];

  setFaultPointHandler(async (id, context) => {
    const records = await ctx.readTriggerRecords();

    reached.push([id, context, records.filter((record) => record.kind === 'trigger.fired').length]);
  });

  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  await ctx.deliver([
    { scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'water-the-tomatoes|2027-03-10T08:00' },
  ]);

  expect(reached).toStrictEqual([
    ['trigger.batch.before', { kind: 'trigger', id: 'schedule' }, 0],
    ['trigger.batch.after', { kind: 'trigger', id: 'schedule' }, 1],
  ]);
});

test('it writes nothing and takes no key for a fire at a task that nixie pause holds', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.pauseNixie();

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  const records = await ctx.readTriggerRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ delivered: 0 });
  expect(records.map((record) => record.kind)).toStrictEqual(['trigger.armed']);
  expect(rows.keys).toStrictEqual([]);
});

test('it writes nothing for a fire at an exempt task while the spending stop stands', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.pauseNixie();
  await ctx.exempt(taskID);
  await ctx.seed.spendStop();

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect([result, rows.keys]).toStrictEqual([{ delivered: 0 }, []]);
});

test('it leaves the watermark where it was, counts nothing and takes no key for a held fire while nixie is paused', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  const before = await readTestTriggerRows(ctx);

  await ctx.pauseNixie();

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  const after = await readTestTriggerRows(ctx);

  expect(result.delivered).toBe(0);

  expect(after.definitions.map((row) => row.after)).toStrictEqual(
    before.definitions.map((row) => row.after),
  );

  expect(after.keys).toStrictEqual([]);
});

test('it takes the fire of an exempt task while nixie is paused', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.pauseNixie();
  await ctx.exempt(taskID);

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  const records = await ctx.readTriggerRecords();
  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ delivered: 1 });

  expect(
    records.filter((record) => record.kind === 'trigger.fired').map((record) => record.thread),
  ).toStrictEqual([taskID]);

  expect(rows.keys.map((row) => row.source_key)).toStrictEqual([
    'schedule\nwater-the-tomatoes|2027-03-10T08:00',
  ]);
});

test('it delivers a mail arrival while nixie is paused', async () => {
  const ctx = await setupTest();

  await ctx.taskSeed.conversationStep();

  const rule = await seedWakeRule(ctx, { match: { from: ['@library.example.org'] } });

  await ctx.pauseNixie();

  ctx.clock.advance(1000);

  const result = await deliverTriggerBatch(ctx.core, 'mail', {
    cursor: null,
    events: [buildTestMailEvent({ payload: { receivedAt: ctx.clock.now() } })],
  });

  const arrivals = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['trigger.mail_arrived'],
  });

  const inbox = await readInbox(ctx.context, 'conversation');

  expect(result).toStrictEqual({ delivered: 1 });
  expect(arrivals).toHaveLength(1);

  expect(
    inbox.filter((record) => record.kind === 'trigger.mail_woke').map((record) => record.payload),
  ).toStrictEqual([
    {
      taskID: 'conversation',
      mails: [
        {
          arrived: expect.any(Number),
          mailbox: 'mail',
          messageID: 'mz4k8q2w7p',
          threadID: 'th6p2k9w4x',
          receivedAt: Date.parse('2027-03-09T00:00:01.000Z'),
        },
      ],
      rules: [
        {
          ruleID: rule.ruleID,
          shortID: rule.shortID,
          match: { from: ['@library.example.org'] },
          expiresAt: null,
        },
      ],
    },
  ]);
});

test('it delivers the same fire once the pause lifts, because its key stayed free', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.pauseNixie();

  await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  await ctx.exempt(taskID);

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  expect(result).toStrictEqual({ delivered: 1 });
});

test('it writes trigger.skipped with task_held for a task at its limit', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.seed.record({
    kind: 'task.limit_reached',
    thread: taskID,
    payload: {
      taskID,
      stepKey: `${taskID}:1`,
      used: { turns: 1, dollars: 0.1 },
      limits: { turns: 1, dollars: 2 },
    },
  });

  await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records
      .filter((record) => record.kind !== 'trigger.armed')
      .map((record) => [record.kind, record.payload['reason']]),
  ).toStrictEqual([['trigger.skipped', 'task_held']]);
});

test('it writes trigger.skipped with task_held for a stopped task, even while nixie is paused', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);
  await writeTaskControl(ctx.context, { taskID, control: 'stop' });

  await ctx.pauseNixie();

  await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  const records = await ctx.readTriggerRecords();

  expect(
    records
      .filter((record) => record.kind !== 'trigger.armed')
      .map((record) => [record.kind, record.payload['reason']]),
  ).toStrictEqual([['trigger.skipped', 'task_held']]);
});

test('it writes nothing for a conversation target while nixie is paused', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition({ target: 'conversation' })]);

  await ctx.pauseNixie();

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  const rows = await readTestTriggerRows(ctx);

  expect([result, rows.keys]).toStrictEqual([{ delivered: 0 }, []]);
});

test('it writes nothing for a conversation target while the spending stop stands', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition({ target: 'conversation' })]);

  await ctx.seed.spendStop();

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  expect(result).toStrictEqual({ delivered: 0 });
});

test('it fires into a conversation that its owner paused', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition({ target: 'conversation' })]);
  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'pause' });

  const result = await ctx.deliver([
    {
      scheduledFor: '2027-03-09T21:00:00.000Z',
      dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    },
  ]);

  expect(result).toStrictEqual({ delivered: 1 });
});

test('it writes trigger.task_input on the thread of the task that a task input names', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const result = await ctx.deliverTaskInputs([
    {
      kind: 'task_input',
      taskID,
      dedupeKey: 'session-1|event-4',
      occurredAt: '2027-03-09T00:00:00.000Z',
      hop: 2,
      wake: true,
      facts: { event: 'pull_request_opened', number: 12 },
      payload: { title: 'Add a frost warning' },
    },
  ]);

  const records = await ctx.readTaskInputs();

  expect(result).toStrictEqual({ delivered: 1 });

  expect(records).toStrictEqual([
    {
      thread: taskID,
      payload: {
        taskID,
        source: 'coding',
        dedupeKey: 'session-1|event-4',
        occurredAt: '2027-03-09T00:00:00.000Z',
        hop: 2,
        wake: true,
        facts: { event: 'pull_request_opened', number: 12 },
      },
      erasable: { status: 'readable', fields: { event: { title: 'Add a frost warning' } } },
    },
  ]);
});

test('it puts a task input that wakes its task in the inbox, and readies the waiting task', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  await ctx.deliverTaskInputs([
    {
      kind: 'task_input',
      taskID,
      dedupeKey: 'session-1|event-4',
      occurredAt: '2027-03-09T00:00:00.000Z',
      hop: 2,
      wake: true,
      facts: { event: 'pull_request_opened' },
      payload: { title: 'Add a frost warning' },
    },
  ]);

  const inbox = await readInbox(ctx.context, taskID);
  const state = await ctx.readTaskState(taskID);

  expect(inbox.map((record) => record.kind)).toStrictEqual(['trigger.task_input']);
  expect(state).toBe('ready');
});

test('it wakes the task of a task input into a step at the hop of the input', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  await ctx.deliverTaskInputs([
    {
      kind: 'task_input',
      taskID,
      dedupeKey: 'session-1|event-4',
      occurredAt: '2027-03-09T00:00:00.000Z',
      hop: 2,
      wake: true,
      facts: { event: 'pull_request_opened' },
      payload: { title: 'Add a frost warning' },
    },
  ]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  expect(claim?.wake).toStrictEqual({ hop: 2, cause: { kind: 'event' } });
});

test('it keeps a task input that does not wake its task out of the inbox, and leaves the task waiting', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  await ctx.deliverTaskInputs([
    {
      kind: 'task_input',
      taskID,
      dedupeKey: 'session-1|event-4',
      occurredAt: '2027-03-09T00:00:00.000Z',
      hop: 2,
      wake: false,
      facts: { event: 'checks_started' },
      payload: { title: 'Add a frost warning' },
    },
  ]);

  const inbox = await readInbox(ctx.context, taskID);
  const state = await ctx.readTaskState(taskID);

  expect(inbox).toStrictEqual([]);
  expect(state).toBe('waiting');
});

test('it writes nothing for a task input whose key an earlier delivery took', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const event: TaskInputEvent = {
    kind: 'task_input',
    taskID,
    dedupeKey: 'session-1|event-4',
    occurredAt: '2027-03-09T00:00:00.000Z',
    hop: 2,
    wake: true,
    facts: { event: 'pull_request_opened' },
    payload: { title: 'Add a frost warning' },
  };

  await ctx.deliverTaskInputs([event]);

  const result = await ctx.deliverTaskInputs([event]);
  const records = await ctx.readTaskInputs();

  expect(result).toStrictEqual({ delivered: 0 });
  expect(records).toHaveLength(1);
});

test('it writes one record for 2 task inputs of one batch that share a key', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const taskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const event: TaskInputEvent = {
    kind: 'task_input',
    taskID,
    dedupeKey: 'session-1|event-4',
    occurredAt: '2027-03-09T00:00:00.000Z',
    hop: 2,
    wake: true,
    facts: { event: 'pull_request_opened' },
    payload: { title: 'Add a frost warning' },
  };

  const result = await ctx.deliverTaskInputs([event, event]);

  expect(result).toStrictEqual({ delivered: 1 });
});

test('it writes nothing for a task input whose task does not exist', async () => {
  const ctx = await setupTest();

  const result = await ctx.deliverTaskInputs([
    {
      kind: 'task_input',
      taskID: 'nosuchtask',
      dedupeKey: 'session-1|event-4',
      occurredAt: '2027-03-09T00:00:00.000Z',
      hop: 2,
      wake: true,
      facts: { event: 'pull_request_opened' },
      payload: { title: 'Add a frost warning' },
    },
  ]);

  const records = await ctx.readTaskInputs();

  expect(result).toStrictEqual({ delivered: 0 });
  expect(records).toStrictEqual([]);
});

test.each([['doneTask'], ['closedTask'], ['failedTask'], ['stoppedTask']] as const)(
  'it writes nothing for a task input whose task the %s seed ended',
  async (seedName) => {
    const ctx = await setupTest();
    const starter = await ctx.taskSeed.conversationStep();

    const taskID = await ctx.taskSeed[seedName]({
      starter: starter.claim,
      name: 'Garden planner',
      brief: 'Add a frost warning to the planner.',
    });

    const result = await ctx.deliverTaskInputs([
      {
        kind: 'task_input',
        taskID,
        dedupeKey: 'session-1|event-4',
        occurredAt: '2027-03-09T00:00:00.000Z',
        hop: 2,
        wake: true,
        facts: { event: 'pull_request_opened' },
        payload: { title: 'Add a frost warning' },
      },
    ]);

    const records = await ctx.readTaskInputs();

    expect(result).toStrictEqual({ delivered: 0 });
    expect(records).toStrictEqual([]);
  },
);

test('it leaves the key of a task input for a stopped task free, so the same event lands on the next task', async () => {
  const ctx = await setupTest();
  const starter = await ctx.taskSeed.conversationStep();

  const stoppedTaskID = await ctx.taskSeed.stoppedTask({
    starter: starter.claim,
    name: 'Garden planner',
    brief: 'Add a frost warning to the planner.',
  });

  const nextTaskID = await ctx.taskSeed.waitingTask({
    starter: starter.claim,
    name: 'Garden planner, again',
    brief: 'Watch the frost warning work.',
  });

  const event = {
    kind: 'task_input',
    dedupeKey: 'session-1|event-4',
    occurredAt: '2027-03-09T00:00:00.000Z',
    hop: 2,
    wake: false,
    facts: { event: 'pull_request_opened' },
    payload: { title: 'Add a frost warning' },
  } as const;

  await ctx.deliverTaskInputs([{ ...event, taskID: stoppedTaskID }]);

  const result = await ctx.deliverTaskInputs([{ ...event, taskID: nextTaskID }]);
  const records = await ctx.readTaskInputs();

  expect(result).toStrictEqual({ delivered: 1 });

  expect(records).toStrictEqual([
    {
      thread: nextTaskID,
      payload: {
        taskID: nextTaskID,
        source: 'coding',
        dedupeKey: 'session-1|event-4',
        occurredAt: '2027-03-09T00:00:00.000Z',
        hop: 2,
        wake: false,
        facts: { event: 'pull_request_opened' },
      },
      erasable: { status: 'readable', fields: { event: { title: 'Add a frost warning' } } },
    },
  ]);
});

test('it fires at the next slot of a definition whose task run failed, and opens a fresh task run', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([{ scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'k-1' }]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null || claim.lease.workID !== taskID) {
    throw new Error('the fire is claimable');
  }

  await writeStepError(ctx.context, claim, {
    maxStepErrors: 1,
    retryDelayMs: 1000,
    maxRetryDelayMs: 1000,
    error: new Error('the model API answered 429'),
  });

  await ctx.deliver([{ scheduledFor: '2027-03-10T21:00:00.000Z', dedupeKey: 'k-2' }]);

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });
  const records = await ctx.readTriggerRecords();
  const open = await readOpenRun(ctx.writer.db, taskID);

  expect(
    records
      .filter((record) => record.kind === 'trigger.fired' || record.kind === 'trigger.skipped')
      .map((record) => [
        record.kind,
        record.payload['dedupeKey'],
        record.payload['reason'] ?? null,
      ]),
  ).toStrictEqual([
    ['trigger.fired', 'k-1', null],
    ['trigger.fired', 'k-2', null],
  ]);

  expect([next?.lease.workID, open?.opened.triggerKey, open?.opened.carriesRunID]).toStrictEqual([
    taskID,
    'k-2',
    null,
  ]);
});

test('it fires at the next slot of a failed definition task that a new version replaced under the same ID', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);

  await ctx.deliver([{ scheduledFor: '2027-03-09T21:00:00.000Z', dedupeKey: 'k-1' }]);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  if (claim === null || claim.lease.workID !== taskID) {
    throw new Error('the fire is claimable');
  }

  await writeStepError(ctx.context, claim, {
    maxStepErrors: 1,
    retryDelayMs: 1000,
    maxRetryDelayMs: 1000,
    error: new Error('the model API answered 429'),
  });

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-2' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition({ definitionHash: 'hash-2' })]);

  await ctx.deliver([
    { scheduledFor: '2027-03-10T21:00:00.000Z', dedupeKey: 'k-2', definitionHash: 'hash-2' },
  ]);

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  const open = await readOpenRun(ctx.writer.db, taskID);

  expect([open?.opened.triggerKey, open?.opened.definitionHash]).toStrictEqual(['k-2', 'hash-2']);
});
