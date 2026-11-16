import { expect, test } from 'bun:test';
import { seedDefinitionTask } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '../core/deliver-trigger-batch';
import {
  buildTestArmedDefinition,
  buildTestTriggerEvent,
  seedArmedDefinitions,
  startTestTriggers,
} from '../test-utils';
import { readTriggerReport } from './read-trigger-report';

async function setupTest() {
  const triggers = await startTestTriggers();

  await seedDefinitionTask(triggers, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedDefinitionTask(triggers, { definitionID: 'prune-the-roses', definitionHash: 'hash-2' });

  await seedArmedDefinitions(triggers, [
    buildTestArmedDefinition(),
    buildTestArmedDefinition({ definitionID: 'prune-the-roses', definitionHash: 'hash-2' }),
  ]);

  triggers.clock.advance(3 * 86_400_000);

  return {
    ...triggers,
    deliver: (event: Parameters<typeof buildTestTriggerEvent>[0]) =>
      deliverTriggerBatch(triggers.core, 'schedule', {
        cursor: null,
        events: [buildTestTriggerEvent(event)],
      }),
    readReport: (query: Parameters<typeof readTriggerReport>[1]) =>
      readTriggerReport(triggers.writer.db, query),
  };
}

test('it reports a catch-up as late, with how late it came', async () => {
  const ctx = await setupTest();

  await ctx.deliver({
    scheduledFor: '2027-03-09T21:00:00.000Z',
    dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
  });

  const entries = await ctx.readReport({ sinceMs: Date.parse('2027-03-09T00:00:00Z') });

  expect(entries).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
      kind: 'late',
      scheduledFor: '2027-03-09T21:00:00.000Z',
      firedAt: '2027-03-12T00:00:00.000Z',
      lateBySeconds: 183_600,
      reason: null,
      sequence: expect.toBeNumber(),
    },
  ]);
});

test('it reports a skip with the newest slot that it covers', async () => {
  const ctx = await setupTest();

  await ctx.deliver({
    scheduledFor: '2027-03-09T21:00:00.000Z',
    dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
    missed: ['2027-03-07T21:00:00.000Z', '2027-03-08T21:00:00.000Z'],
    missedCount: 2,
    skip: 'catch_up_off',
  });

  const entries = await ctx.readReport({ sinceMs: Date.parse('2027-03-07T00:00:00Z') });

  expect(entries).toStrictEqual([
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: null,
      kind: 'skipped',
      scheduledFor: '2027-03-09T21:00:00.000Z',
      firedAt: null,
      lateBySeconds: null,
      reason: 'catch_up_off',
      sequence: expect.toBeNumber(),
    },
  ]);
});

test('it leaves out a fire on time', async () => {
  const ctx = await setupTest();

  await ctx.deliver({
    scheduledFor: '2027-03-12T00:00:00.000Z',
    dedupeKey: 'water-the-tomatoes|2027-03-12T11:00',
  });

  const entries = await ctx.readReport({ sinceMs: Date.parse('2027-03-01T00:00:00Z') });

  expect(entries).toStrictEqual([]);
});

test('it leaves out an entry scheduled before the start', async () => {
  const ctx = await setupTest();

  await ctx.deliver({
    scheduledFor: '2027-03-09T21:00:00.000Z',
    dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
  });

  const entries = await ctx.readReport({ sinceMs: Date.parse('2027-03-09T22:00:00Z') });

  expect(entries).toStrictEqual([]);
});

test('it lists the newest entry first, and only the definition that the query names', async () => {
  const ctx = await setupTest();

  await ctx.deliver({
    scheduledFor: '2027-03-09T21:00:00.000Z',
    dedupeKey: 'water-the-tomatoes|2027-03-10T08:00',
  });

  await ctx.deliver({
    definitionID: 'prune-the-roses',
    definitionHash: 'hash-2',
    scheduledFor: '2027-03-10T22:00:00.000Z',
    dedupeKey: 'prune-the-roses|2027-03-10T09:00',
    skip: 'too_late',
  });

  const all = await ctx.readReport({ sinceMs: 0 });
  const roses = await ctx.readReport({ sinceMs: 0, definitionID: 'prune-the-roses' });

  expect(all.map((entry) => entry.definitionID)).toStrictEqual([
    'prune-the-roses',
    'water-the-tomatoes',
  ]);

  expect(roses.map((entry) => entry.definitionID)).toStrictEqual(['prune-the-roses']);
});
