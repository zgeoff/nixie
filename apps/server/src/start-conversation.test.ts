import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { startScriptedModel } from '@heynixie/testing';
import { startConversation } from './start-conversation';
import { buildTestModelsConfig } from './test-utils/build-test-models-config';
import { collectFilesWithText } from './test-utils/collect-files-with-text';
import { sendTestMessage } from './test-utils/send-test-message';
import { startTestMemoryStore } from './test-utils/start-test-memory-store';
import { startTestServer } from './test-utils/start-test-server';

interface RunnerConfig {
  // the conversation image's name, whose change replaces the conversation's sandbox
  readonly image: string;
  readonly contextTokens?: number;
}

// a test server, the scripted model, and a memory store whose forget cleans up the sessions of the
// runner a test started last
async function setupTest() {
  const server = await startTestServer();
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const context = server.context;

  // before a runner starts, no session holds anything to clean up
  const runners = { last: null as Awaited<ReturnType<typeof startConversation>> | null };
  const memory = await startTestMemoryStore(
    context,
    (itemID) => runners.last?.cleanupSessions(itemID) ?? Promise.resolve(),
  );

  return {
    ...server,
    context,
    model,
    memory,
    startRunner: async (config: RunnerConfig) => {
      await runners.last?.stop();
      runners.last = await startConversation({
        context,
        models: buildTestModelsConfig({ modelURL: model.url, ...config }),
        secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
        sandboxes: server.sandboxes,
        tools: server.endpoint,
        toolNames: [],
        image: config.image,
        getSystemPrompt: () => 'You are nixie.',
        memory: () => memory,
      });
      return runners.last;
    },
    readRecords: async () => {
      const entries = await readRecords(context.log, { afterSequence: 0, limit: 1000 });

      return entries.map((entry) => entry.record);
    },
    readLastRequest: () =>
      model.requests.findLast((request) => request.path === '/v1/messages')?.body ?? null,
  };
}

test('it runs each turn in the conversation guest on the role profile and resumes at the boundary', async () => {
  const ctx = await setupTest();
  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' });
  await sendTestMessage(ctx.context, runner.runStep, 'Say a fruit.');
  await sendTestMessage(ctx.context, runner.runStep, 'Another.');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.reply')).toMatchObject([
    {
      payload: { model: 'claude-test-1', profile: 'chat-direct' },
      erasable: { fields: { text: 'APPLE' } },
    },
    {
      payload: { model: 'claude-test-1', profile: 'chat-direct' },
      erasable: { fields: { text: 'BANANA' } },
    },
  ]);
  expect(ctx.model.requests.filter((request) => request.path === '/v1/messages')).toMatchObject([
    { headers: { 'x-api-key': 'imp-broker-placeholder' }, body: { model: 'claude-test-1' } },
    { headers: { 'x-api-key': 'imp-broker-placeholder' }, body: { model: 'claude-test-1' } },
  ]);
  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toInclude('APPLE');
}, 30_000);

test('it puts a pinned item in the next turn system prompt, with the change note before the message', async () => {
  const ctx = await setupTest();
  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'Hello.' }, { text: 'You go by Sam.' });
  await sendTestMessage(ctx.context, runner.runStep, 'Hi.');

  const item = await ctx.memory.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await sendTestMessage(ctx.context, runner.runStep, 'What do I go by?');

  const request = ctx.readLastRequest();

  expect(JSON.stringify(request?.system)).toInclude(`- [${item.itemID}] Goes by Sam`);
  expect(JSON.stringify(request?.messages)).toInclude(
    String.raw`- Pinned [${item.itemID}]: Goes by Sam\n</pinned-memory-changes>\n\nWhat do I go by?`,
  );
}, 30_000);

test('it rebuilds the session with the recent turns once the conversation sandbox is replaced', async () => {
  const ctx = await setupTest();
  const [first] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' }, { text: 'CHERRY' });
  await sendTestMessage(ctx.context, first.runStep, 'Say a fruit.');
  await sendTestMessage(ctx.context, first.runStep, 'Another.');

  const second = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  await sendTestMessage(ctx.context, second.runStep, 'And one more.');

  const records = await ctx.readRecords();

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toSatisfy(
    (messages: string) =>
      messages.includes('<conversation-history>') &&
      messages.includes(String.raw`] owner: Say a fruit.\n[`) &&
      messages.includes(String.raw`] nixie: APPLE\n[`) &&
      messages.includes(String.raw`] owner: Another.\n[`) &&
      messages.includes(String.raw`] nixie: BANANA\n</conversation-history>\n\nAnd one more.`),
  );
  expect(records.filter((record) => record.kind === 'model.session_rebuilt')).toMatchObject([
    { payload: { reason: 'missing', recentRecords: 4 } },
  ]);
}, 30_000);

test('it removes every session file that holds a forgotten item', async () => {
  const ctx = await setupTest();
  const [key, runner] = await Promise.all([
    ctx.memory.remember({
      text: 'The spare key sits under the blue flowerpot',
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' });
  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');

  const held = await collectFilesWithText(`${ctx.dataDir}/sandboxes`, 'blue flowerpot');

  await ctx.memory.forget({
    target: key,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const left = await collectFilesWithText(`${ctx.dataDir}/sandboxes`, 'blue flowerpot');

  expect(held).toSatisfy((paths: readonly string[]) =>
    paths.some((path) => path.includes('/fs/.claude/projects/')),
  );
  expect(left).toStrictEqual([]);
}, 30_000);

test('it runs the turn after a forget on a rebuilt session without the forgotten item', async () => {
  const ctx = await setupTest();
  const [key, runner] = await Promise.all([
    ctx.memory.remember({
      text: 'The spare key sits under the blue flowerpot',
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' }, { text: 'You are welcome.' });
  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');
  await ctx.memory.forget({
    target: key,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  await sendTestMessage(ctx.context, runner.runStep, 'Thanks.');

  const records = await ctx.readRecords();

  expect(JSON.stringify(ctx.readLastRequest())).toSatisfy(
    (request: string) => request.includes('Thanks.') && !request.includes('blue flowerpot'),
  );
  expect(records.filter((record) => record.kind === 'model.session_rebuilt')).toMatchObject([
    { payload: { reason: 'invalidated' } },
  ]);
}, 30_000);

test('it records an automatic compaction once, with its token counts and no summary text', async () => {
  const ctx = await setupTest();
  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab', contextTokens: 100_000 }),
    createConversationTask(ctx.context),
  ]);

  // the tool call reports a context past the window, so the CLI compacts before its next call,
  // and the summary request takes the reply after it
  ctx.model.addReplies(
    { text: 'APPLE' },
    { text: 'BANANA' },
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} }, inputTokens: 150_000 },
    { text: 'SUMMARY: the owner said one and two.' },
    { text: 'CHERRY' },
  );
  await sendTestMessage(ctx.context, runner.runStep, 'one');
  await sendTestMessage(ctx.context, runner.runStep, 'two');
  await sendTestMessage(ctx.context, runner.runStep, 'three');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.compacted')).toMatchObject([
    {
      thread: 'conversation',
      payload: {
        trigger: 'auto',
        preTokens: expect.toBeWithin(150_000, 160_000),
        postTokens: expect.toBeNumber(),
      },
      erasable: { status: 'none' },
    },
  ]);
  expect(JSON.stringify(records)).not.toInclude('SUMMARY');
}, 30_000);
