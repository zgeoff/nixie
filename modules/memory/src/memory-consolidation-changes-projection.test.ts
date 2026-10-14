import { expect, test } from 'bun:test';
import { buildShortIDFromUUID } from '@heynixie/db';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { memoryConsolidatorTaskID } from './memory-consolidator-task-id';
import { planDiffRecord } from './plan-diff-record';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

test('it gives a change from a record before short IDs the short ID its UUID gives', async () => {
  const memory = await startTestMemory();
  const item = await createMemoryItem(memory.store, { text: 'Keeps bees' });
  const record = await planDiffRecord(memory.log, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    model: 'claude-test-1',
    shownItems: 1,
    now: Date.now(),
    lapseMs: 60_000,
    definitions: { snapshotHash: 'sha256:test' },
  });
  const changes = z.array(z.record(z.string(), z.json())).parse(record.payload?.['changes']);

  // the record as a build before short IDs wrote it, with no short ID on its change
  await writeRecords(memory.log, [
    {
      ...record,
      thread: memoryConsolidatorTaskID,
      payload: {
        ...record.payload,
        changes: changes.map((change) =>
          Object.fromEntries(Object.entries(change).filter(([key]) => key !== 'shortID')),
        ),
      },
    },
  ]);

  const pending = await memory.store.consolidations.readPending();
  const [change] = pending?.changes ?? [];

  invariant(change);
  expect(change.shortID).toBe(buildShortIDFromUUID(change.changeID));
});

test('it keeps the short ID a record gives its change', async () => {
  const memory = await startTestMemory();
  const item = await createMemoryItem(memory.store, { text: 'Keeps bees' });
  const record = await planDiffRecord(memory.log, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    model: 'claude-test-1',
    shownItems: 1,
    now: Date.now(),
    lapseMs: 60_000,
    definitions: { snapshotHash: 'sha256:test' },
  });
  const [recorded] = z.array(z.object({ shortID: z.string() })).parse(record.payload?.['changes']);

  await writeRecords(memory.log, [{ ...record, thread: memoryConsolidatorTaskID }]);

  const pending = await memory.store.consolidations.readPending();

  expect(pending?.changes[0]?.shortID).toBe(recorded?.shortID);
});
