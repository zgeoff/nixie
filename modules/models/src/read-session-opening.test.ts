import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readSessionOpening } from './read-session-opening';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it opens a resumed session with when each reply of the last turn was sent, and no recent records', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { timeZone: 'Asia/Tokyo' },
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const opening = await readSessionOpening(
    ctx.tasks.context,
    { resume: { sessionID: crypto.randomUUID(), messageID: crypto.randomUUID() } },
    {
      taskID: 'conversation',
      beforeSequence: Number.MAX_SAFE_INTEGER,
      rebuildTokens: 30_000,
      times: { defaultZone: 'Australia/Sydney', now: new Date() },
    },
  );

  expect(opening).toStrictEqual({
    blocks: [
      expect.toSatisfy((block: string) =>
        /^<reply-times>\nYour replies in your last turn, each with the time it was sent:\n\[\w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, Tokyo\] It came at noon\.\n<\/reply-times>$/u.test(
          block,
        ),
      ),
    ],
    recentRecords: 0,
  });
});

test('it opens a new session with its marker and the recent turns, with no reply times', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Did the parcel come?' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'It came at noon.' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const opening = await readSessionOpening(
    ctx.tasks.context,
    { resume: null, lost: null },
    {
      taskID: 'conversation',
      beforeSequence: Number.MAX_SAFE_INTEGER,
      rebuildTokens: 30_000,
      times: { defaultZone: 'Australia/Sydney', now: new Date() },
    },
  );

  expect(opening).toStrictEqual({
    blocks: [
      'This is a new session; earlier history is in the event log.',
      expect.toSatisfy(
        (block: string) =>
          block.startsWith('<conversation-history>\n') &&
          block.includes('] owner: Did the parcel come?\n[') &&
          block.endsWith('] nixie: It came at noon.\n</conversation-history>'),
      ),
    ],
    recentRecords: 2,
  });
});
