import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { readThreadPage } from './read-thread-page';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { writeOwnerMessage } from './write-owner-message';

function setupTest() {
  return startTestAPI();
}

test('it reads the page before a sequence, newest last', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const sendText = (text: string) =>
    writeOwnerMessage(ctx.context, laptop.caller, {
      clientMessageId: crypto.randomUUID(),
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await sendText('one').then(() => sendText('two'));

  const three = await sendText('three');

  invariant(three.status === 'written');
  const page = await readThreadPage(ctx.context, {
    thread: 'conversation',
    beforeSequence: three.sequence,
    limit: 1,
  });

  expect(page?.hasEarlier).toBeTrue();
  expect(page?.readAtSequence).toBe(three.sequence);
  expect(page?.records.map((record) => record.message?.text)).toStrictEqual(['two']);
});

test('it reads a whole short thread with no earlier page', async () => {
  const ctx = await setupTest();

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  expect(page?.hasEarlier).toBeFalse();
  expect(page?.records.map((record) => record.kind)).toStrictEqual(['task.created']);
});

test('it answers null for a thread with no records', async () => {
  const ctx = await setupTest();

  const result = await readThreadPage(ctx.context, { thread: 'task-404' });

  expect(result).toBeNull();
});
