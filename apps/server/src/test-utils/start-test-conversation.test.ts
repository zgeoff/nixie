import { expect, test } from 'bun:test';
import { writeInboxRecords } from '@heynixie/tasks';
import { runTaskSteps } from './run-task-steps';
import { startTestConversation } from './start-test-conversation';
import { startTestServer } from './start-test-server';

// a test server for the conversation to run on
async function setupTest() {
  return { server: await startTestServer() };
}

test('it runs a turn on its own model with the note before your message', async () => {
  const ctx = await setupTest();

  const conversation = await startTestConversation(ctx.server, {
    context: ctx.server.context,
    readTurnNote: () => Promise.resolve({ text: 'NOTE', throughSequence: 0, eventCount: 0 }),
  });

  conversation.model.addReplies({ text: 'APPLE' });

  await writeInboxRecords(ctx.server.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Say a fruit.' },
    },
  ]);

  await runTaskSteps(ctx.server.context, {
    steps: { conversation: conversation.runner.runStep },
    advance: () => {},
    maxSteps: 5,
  });

  const sent = conversation.model.requests.filter((request) => request.path === '/v1/messages');

  expect(JSON.stringify(sent.at(-1)?.body?.messages)).toMatch(
    /NOTE\\n\\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Say a fruit\./u,
  );
}, 30_000);
