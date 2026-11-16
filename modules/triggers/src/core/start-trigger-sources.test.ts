import { expect, test } from 'bun:test';
import { seedDefinitionTask } from '@heynixie/tasks/test-utils';
import {
  buildTestArmedDefinition,
  buildTestTriggerEvent,
  readTestTriggerRows,
  seedArmedDefinitions,
  startTestTriggers,
} from '../test-utils';
import type { TriggerContext, TriggerSource } from '../types';
import { deliverTriggerBatch } from './deliver-trigger-batch';
import { startTriggerSources } from './start-trigger-sources';

async function setupTest() {
  const triggers = await startTestTriggers();

  const started: TriggerContext[] = [];
  const stops: string[] = [];

  const buildSource = (
    id: string,
    failures: { start?: Error; stop?: Error } = {},
  ): TriggerSource => ({
    id,
    kind: 'schedule',
    start: (context) => {
      started.push(context);

      return failures.start ? Promise.reject(failures.start) : Promise.resolve();
    },
    stop: () => {
      stops.push(id);

      return failures.stop ? Promise.reject(failures.stop) : Promise.resolve();
    },
  });

  return { ...triggers, started, stops, buildSource };
}

test('it hands a source the cursor that nixie stored for it', async () => {
  const ctx = await setupTest();

  await deliverTriggerBatch(ctx.core, 'schedule', { cursor: { page: 3 }, events: [] });
  await startTriggerSources([ctx.buildSource('schedule')], ctx.core);

  expect(ctx.started.map((context) => context.cursor)).toStrictEqual([{ page: 3 }]);
});

test('it hands a source a null cursor when none is stored', async () => {
  const ctx = await setupTest();

  await startTriggerSources([ctx.buildSource('schedule')], ctx.core);

  expect(ctx.started.map((context) => context.cursor)).toStrictEqual([null]);
});

test('it commits the batch of a source under the ID of the source', async () => {
  const ctx = await setupTest();

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: 'hash-1' });
  await seedArmedDefinitions(ctx, [buildTestArmedDefinition()]);
  await startTriggerSources([ctx.buildSource('schedule')], ctx.core);

  const result = await ctx.started[0]?.deliver({
    cursor: { page: 1 },
    events: [buildTestTriggerEvent()],
  });

  const rows = await readTestTriggerRows(ctx);

  expect(result).toStrictEqual({ delivered: 1 });

  expect(rows.sources.map((row) => [row.source_id, row.cursor])).toStrictEqual([
    ['schedule', '{"page":1}'],
  ]);
});

test('it logs a change of health once and holds the latest', async () => {
  const ctx = await setupTest();
  const sources = await startTriggerSources([ctx.buildSource('schedule')], ctx.core);

  ctx.started[0]?.reportHealth('running');
  ctx.started[0]?.reportHealth('running');
  ctx.started[0]?.reportHealth('unhealthy');

  expect(ctx.logged).toStrictEqual([
    { event: 'trigger_source.health', fields: { source: 'schedule', health: 'running' } },
    { event: 'trigger_source.health', fields: { source: 'schedule', health: 'unhealthy' } },
  ]);

  expect(sources.readHealth()).toStrictEqual(new Map([['schedule', 'unhealthy']]));
});

test('it aborts the signal of each source and stops it', async () => {
  const ctx = await setupTest();

  const sources = await startTriggerSources(
    [ctx.buildSource('schedule'), ctx.buildSource('poll')],
    ctx.core,
  );

  await sources.stop();

  expect(ctx.started.map((context) => context.signal.aborted)).toStrictEqual([true, true]);
  expect(ctx.stops).toStrictEqual(['schedule', 'poll']);
});

test('it starts no source for an empty list', async () => {
  const ctx = await setupTest();
  const sources = await startTriggerSources([], ctx.core);

  await sources.stop();

  expect(sources.readHealth()).toStrictEqual(new Map());
});

test('it aborts and stops the sources already started when a later source fails to start', async () => {
  const ctx = await setupTest();

  const startError = new Error('cannot start');

  const promise = startTriggerSources(
    [ctx.buildSource('schedule'), ctx.buildSource('poll', { start: startError })],
    ctx.core,
  );

  await expect(promise).rejects.toBe(startError);

  expect(ctx.started.map((context) => context.signal.aborted)).toStrictEqual([true, true]);
  expect(ctx.stops).toStrictEqual(['schedule']);
});

test('it stops every source and rejects when one stop rejects', async () => {
  const ctx = await setupTest();

  const stopError = new Error('cannot stop');

  const sources = await startTriggerSources(
    [ctx.buildSource('schedule', { stop: stopError }), ctx.buildSource('poll')],
    ctx.core,
  );

  const promise = sources.stop();

  await expect(promise).rejects.toMatchObject({ errors: [stopError] });

  expect(ctx.stops).toStrictEqual(['schedule', 'poll']);
});
