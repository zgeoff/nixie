import { expect, test } from 'bun:test';
import { readThreadPage } from './read-thread-page';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { verifySessionToken } from './verify-session-token';
import { writeOwnerMessage } from './write-owner-message';

async function setupTest() {
  const api = await startTestAPI();
  const session = await createDeviceSession(api.context, 'laptop');
  const caller = await verifySessionToken(api.context, session.token);

  if (caller === null) {
    throw new Error('the session failed to resolve');
  }
  return { ...api, caller };
}

test('it reads the page before a sequence, newest last', async () => {
  const ctx = await setupTest();

  const sendText = (text: string) =>
    writeOwnerMessage(ctx.context, ctx.caller, {
      clientMessageId: crypto.randomUUID(),
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await sendText('one').then(() => sendText('two'));

  const three = await sendText('three');

  if (three.status !== 'written') {
    throw new Error('the message was not written');
  }
  const page = await readThreadPage(ctx.context, {
    thread: 'conversation',
    beforeSequence: three.sequence,
    limit: 1,
  });

  expect(page).toStrictEqual({
    hasEarlier: true,
    readAtSequence: three.sequence,
    records: [expect.objectContaining({ message: expect.objectContaining({ text: 'two' }) })],
  });
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
