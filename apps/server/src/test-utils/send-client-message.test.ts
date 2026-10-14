import { expect, test } from 'bun:test';
import { createTestClient } from './create-test-client';
import { sendClientMessage } from './send-client-message';
import { startTestNixie } from './start-test-nixie';

// nixie in a test build at ready, and a client signed in through the code it printed at start
async function setupTest() {
  const nixie = await startTestNixie();
  const clients = await createTestClient(nixie);

  return { ...nixie, ...clients };
}

test('it sends the message with its spans and returns the thread once the reply arrives', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello back.' });
  const records = await sendClientMessage(
    ctx.client,
    { text: 'Hello.', spans: [{ start: 0, end: 6, source: 'typed' }] },
    'Hello back.',
  );

  expect(records.filter((record) => record.message !== undefined)).toMatchObject([
    {
      kind: 'owner_message',
      message: { text: 'Hello.', spans: [{ start: 0, end: 6, source: 'typed' }] },
    },
    { kind: 'model.reply', message: { text: 'Hello back.' } },
  ]);
}, 60_000);

test('it sends a message with no spans, which the server labels unknown', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'Hello back.' });
  const records = await sendClientMessage(ctx.client, { text: 'Hello.' }, 'Hello back.');

  expect(records.find((record) => record.kind === 'owner_message')?.message?.spans).toStrictEqual([
    { start: 0, end: 6, source: 'unknown' },
  ]);
}, 60_000);
