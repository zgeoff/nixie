import { expect, mock, test } from 'bun:test';
import { buildConversationDriver } from './build-conversation-driver';
import { buildTestNotesTools } from './build-test-notes-tools';
import { startTestConversation } from './start-test-conversation';
import type { TestServerTools } from './start-test-server';
import { startTestServer } from './start-test-server';

async function setupTest(options: { readonly tools?: TestServerTools } = {}) {
  return { server: await startTestServer(options.tools, { fakeGuest: true }) };
}

test('it runs a turn with the note before your message', async () => {
  const ctx = await setupTest();

  const conversation = await startTestConversation(ctx.server, {
    context: ctx.server.context,
    readTurnNote: () => Promise.resolve({ text: 'NOTE', throughSequence: 0, eventCount: 0 }),
  });

  const driver = buildConversationDriver({
    context: ctx.server.context,
    guest: ctx.server.guest,
    getRunStep: () => conversation.runner.runStep,
  });

  const turn = await driver.send('Say a fruit.');

  expect(turn.input[0]?.text).toMatch(
    /NOTE\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] Say a fruit\.$/u,
  );
});

test('it serves the tools named to the turn and reads the memory given at each turn', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');

  const ctx = await setupTest({ tools: notes.tools });

  const recall = mock(() => Promise.resolve({ items: [] }));

  const conversation = await startTestConversation(ctx.server, {
    context: ctx.server.context,
    toolNames: ['notes_read'],
    memory: () => ({
      readPinnedCore: () => Promise.resolve([]),
      readPinnedCoreUse: () => Promise.resolve({ items: 0, tokens: 0, budget: 2000 }),
      recall,
      recallMessages: () => Promise.resolve({ messages: [] }),
      readShortIDs: () => Promise.resolve(new Map()),
    }),
  });

  const driver = buildConversationDriver({
    context: ctx.server.context,
    guest: ctx.server.guest,
    getRunStep: () => conversation.runner.runStep,
  });

  ctx.server.guest.addReplies(
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} } },
    { text: 'It says oat milk.' },
  );

  await driver.send('What did my note say?');

  const records = await ctx.server.readRecords();

  expect(records.filter((record) => record.kind === 'tool_called')).toMatchObject([
    { decision: { outcome: 'allow' } },
  ]);

  expect(recall).toHaveBeenCalledOnce();
});
