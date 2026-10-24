import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readOpeningBatch } from './read-opening-batch';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';
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

  const opening = await readOpeningBatch(ctx.log, inbox, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    images: { bytes: 24 * 1024 * 1024 - 12, count: 3 },
  });

  expect(opening.batch.records).toStrictEqual(inbox.slice(0, 1));

  expect(opening.images).toStrictEqual({
    spent: { bytes: 24 * 1024 * 1024 - 4, count: 4 },
    budget: { bytes: 24 * 1024 * 1024, count: 100 },
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
    view: buildMockTaskMessageView(),
    images: { bytes: 0, count: 0 },
  });

  expect(opening.batch.records).toHaveLength(2);
  expect(opening.images.spent).toStrictEqual({ bytes: 8, count: 1 });
});

test('it opens with the records whose images fit the 100 a session holds, however small', async () => {
  const ctx = await setupTest();

  const icon = {
    kind: 'owner_message' as const,
    definitions: { snapshotHash: 'sha256:test' },
    thread: 'conversation',
    payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/png' }] },
    erasable: { text: 'Two more icons.' },
    attachments: [new Uint8Array(6).fill(1), new Uint8Array(6).fill(2)],
  };

  const inbox = await writeRecords(ctx.log, [icon, icon]);

  const opening = await readOpeningBatch(ctx.log, inbox, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    images: { bytes: 776, count: 97 },
  });

  expect(opening.batch.records).toStrictEqual(inbox.slice(0, 1));
  expect(opening.images.spent).toStrictEqual({ bytes: 792, count: 99 });
});
