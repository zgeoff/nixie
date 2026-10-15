import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readOpeningBatch } from './read-opening-batch';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { log: tasks.context.log };
}

test('it opens with the records whose images fit what the session leaves, and counts them', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The first plan.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The second plan.' },
      attachments: [new Uint8Array(6).fill(2)],
    },
  ]);

  // the session leaves room for 12 bytes, and each 6-byte image reads as 8 in base64
  const opening = await readOpeningBatch(ctx.log, inbox, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    imageBytes: 24 * 1024 * 1024 - 12,
  });

  expect(opening.batch.records).toStrictEqual(inbox.slice(0, 1));

  expect(opening.images).toStrictEqual({
    spent: 24 * 1024 * 1024 - 4,
    budget: 24 * 1024 * 1024,
    isCapped: false,
  });
});

test('it opens a new session with every record that fits the whole budget', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The first plan.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Which one fits?' },
    },
  ]);

  const opening = await readOpeningBatch(ctx.log, inbox, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    imageBytes: 0,
  });

  expect(opening.batch.records).toHaveLength(2);
  expect(opening.images.spent).toBe(8);
});
