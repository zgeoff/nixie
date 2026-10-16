import { expect, mock, test } from 'bun:test';
import { writeInboxRecords } from '@heynixie/tasks';
import { buildTestNotesTools } from './build-test-notes-tools';
import { runTaskSteps } from './run-task-steps';
import { startTestConversation } from './start-test-conversation';
import type { TestServerTools } from './start-test-server';
import { startTestServer } from './start-test-server';

// a test server for the conversation to run on, serving the tools given or none
async function setupTest(options: { readonly tools?: TestServerTools } = {}) {
  return { server: await startTestServer(options.tools) };
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

test('it lists the tools named and reads the memory given at each turn', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');

  const ctx = await setupTest({ tools: notes.tools });

  const recall = mock(() => Promise.resolve({ items: [] }));

  const conversation = await startTestConversation(ctx.server, {
    context: ctx.server.context,
    toolNames: ['notes_read'],
    memory: () => ({
      readPinnedCore: () => Promise.resolve([]),
      recall,
      readShortIDs: () => Promise.resolve(new Map()),
    }),
  });

  conversation.model.addReplies({ text: 'PEAR' });

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

  expect(sent.at(-1)?.body).toMatchObject({
    tools: expect.toIncludeAllPartialMembers([{ name: 'mcp__nixie__notes_read' }]),
  });

  expect(recall).toHaveBeenCalledOnce();
}, 30_000);
