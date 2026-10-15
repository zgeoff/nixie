import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { isSessionImagesFull } from './is-session-images-full';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { run: { context: tasks.context, defaultZone: 'Australia/Sydney' } };
}

test('it reads the session as full when the first message would take its images past the budget', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.run.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'One more shelf.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
  ]);

  // 6 bytes read as 8 in base64, which passes the 24 MiB budget by 4
  const isFull = await isSessionImagesFull(ctx.run, {
    inbox,
    images: { bytes: 24 * 1024 * 1024 - 4, count: 1 },
  });

  expect(isFull).toBeTrue();
});

test('it reads the session as having room when the first message brings its images to the budget', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.run.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'One more shelf.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
  ]);

  const isFull = await isSessionImagesFull(ctx.run, {
    inbox,
    images: { bytes: 24 * 1024 * 1024 - 8, count: 1 },
  });

  expect(isFull).toBeFalse();
});

test('it reads the session as full when the first message would take its images past 100, however small', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.run.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'One more icon.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
  ]);

  const isFull = await isSessionImagesFull(ctx.run, {
    inbox,
    images: { bytes: 800, count: 100 },
  });

  expect(isFull).toBeTrue();
});

test('it reads the session as having room when the first message brings its images to 100', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.run.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'One more icon.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
  ]);

  const isFull = await isSessionImagesFull(ctx.run, {
    inbox,
    images: { bytes: 792, count: 99 },
  });

  expect(isFull).toBeFalse();
});

test('it reads a session past its budget as having room for a message with no images', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.run.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Which one fits?' },
    },
  ]);

  const isFull = await isSessionImagesFull(ctx.run, {
    inbox,
    images: { bytes: 25 * 1024 * 1024, count: 1 },
  });

  expect(isFull).toBeFalse();
});

test('it reads a session with no images as having room for any message', async () => {
  const ctx = await setupTest();

  const inbox = await writeRecords(ctx.run.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'A large plan.' },
      attachments: [new Uint8Array(30).fill(1)],
    },
  ]);

  const isFull = await isSessionImagesFull(ctx.run, { inbox, images: { bytes: 0, count: 0 } });

  expect(isFull).toBeFalse();
});
