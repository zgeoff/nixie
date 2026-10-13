import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestServer } from './start-test-server';
import { writeOwnerMessages } from './write-owner-messages';

// a test server, whose log the messages go to
async function setupTest() {
  const server = await startTestServer();

  return { log: server.context.log };
}

test('it records each message on the conversation thread, typed in full, and returns their sequences', async () => {
  const ctx = await setupTest();

  const sequences = await writeOwnerMessages(ctx.log, ['I live at 4 Elm Row.', 'I work nights.']);

  const entries = await readRecords(ctx.log, { afterSequence: 0, thread: 'conversation' });

  expect(entries.map((entry) => entry.record)).toMatchObject([
    {
      sequence: sequences[0],
      kind: 'owner_message',
      erasable: {
        status: 'readable',
        fields: { text: 'I live at 4 Elm Row.', spans: [{ start: 0, end: 20, source: 'typed' }] },
      },
    },
    {
      sequence: sequences[1],
      kind: 'owner_message',
      erasable: {
        status: 'readable',
        fields: { text: 'I work nights.', spans: [{ start: 0, end: 14, source: 'typed' }] },
      },
    },
  ]);
});
