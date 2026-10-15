import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readTurnBatch } from './read-turn-batch';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { log: tasks.context.log };
}

test('it takes the oldest 64 records of a longer inbox', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(
    ctx.log,
    Array.from({ length: 65 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `Note ${index + 1}` },
    })),
  );

  const batch = await readTurnBatch(ctx.log, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
  });

  expect(batch.records).toStrictEqual(records.slice(0, 64));
  expect(batch.messages).toHaveLength(64);
});

test('it leaves a record for the next turn when its images would pass 24 MiB with the ones before', async () => {
  const ctx = await setupTest();

  // each record's 2 images of 5 MiB read as about 13.3 MiB in base64, so 2 records pass 24 MiB
  const records = await writeRecords(
    ctx.log,
    Array.from({ length: 2 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/jpeg' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: `Photos ${index + 1}` },
      attachments: [new Uint8Array(5 * 1024 * 1024), new Uint8Array(5 * 1024 * 1024)],
    })),
  );

  const batch = await readTurnBatch(ctx.log, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
  });

  expect(batch.records).toStrictEqual(records.slice(0, 1));
  expect(batch.messages.map((message) => message.images?.length)).toStrictEqual([2]);
});
