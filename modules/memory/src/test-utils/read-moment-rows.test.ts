import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MomentTables } from '../moment-types';
import { readMomentRows } from './read-moment-rows';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MomentTables>() };
}

test('it reads every moment projection in key order', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the kettle needs descaling again' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const rows = await readMomentRows(ctx.db);

  expect(rows.moments).toMatchObject([{ moment_id: kept.momentID, version: 1 }]);
  expect(rows.texts).toStrictEqual([{ sequence: kept.sequence, moment_id: kept.momentID }]);
  expect(rows.reflections).toStrictEqual([]);
  expect(rows.links).toStrictEqual([]);
});

test('it reads empty moment projections as empty lists', async () => {
  const ctx = await setupTest();
  const rows = await readMomentRows(ctx.db);

  expect(rows).toStrictEqual({
    moments: [],
    reflections: [],
    links: [],
    texts: [],
  });
});
