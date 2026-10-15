import { expect, mock, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { conversationTaskID, createConversationTask } from '@heynixie/tasks';
import { startScriptedModel } from '@heynixie/testing';
import { startConversation } from './start-conversation';
import { buildTestModelsConfig } from './test-utils/build-test-models-config';
import { collectFilesWithText } from './test-utils/collect-files-with-text';
import { sendTestMessage } from './test-utils/send-test-message';
import { startTestMemoryStore } from './test-utils/start-test-memory-store';
import { startTestServer } from './test-utils/start-test-server';

// root reads a file whatever its mode, so the unreadable transcript fails no copy under root; Bun
// 1.4.2's skipIf takes a boolean and has no in-body skip
const isRoot = process.getuid?.() === 0;

interface RunnerConfig {
  // the conversation image's name, whose change replaces the conversation's sandbox
  readonly image: string;
  readonly contextTokens?: number;
  readonly memorySettings?: Parameters<typeof startConversation>[0]['memorySettings'];
}

// a test server, the scripted model, a recorder for the server's log, the folder of the process
// double's sandboxes, a memory store whose forget cleans up the sessions of the runner a test
// started last, and a start of the conversation that stops the runner before it, as a deploy does
async function setupTest() {
  const server = await startTestServer();

  const model = startScriptedModel();
  const log = mock<Parameters<typeof startConversation>[0]['log']>();

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
    log,
    sandboxesDir: `${server.dataDir}/sandboxes`,
    startRunner: async (config: RunnerConfig) => {
      await runners.last?.stop();

      runners.last = await startConversation({
        context,
        models: buildTestModelsConfig({ modelURL: model.url, ...config }),
        ...(config.memorySettings === undefined ? {} : { memorySettings: config.memorySettings }),
        secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
        sandboxes: server.sandboxes,
        tools: server.endpoint,
        toolNames: [],
        image: config.image,
        getSystemPrompt: () => 'You are nixie.',
        memory: () => memory,
        log,
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

test('it opens a new session with a pinned item and the line that says where it came from in the first message, and leaves it out of the system prompt', async () => {
  const ctx = await setupTest();

  const [item, runner] = await Promise.all([
    ctx.memory.remember({
      text: 'Goes by Sam',
      isPinned: true,
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

  ctx.model.addReplies({ text: 'You go by Sam.' });

  const [shortIDs] = await Promise.all([
    ctx.memory.readShortIDs([item.itemID]),
    sendTestMessage(ctx.context, runner.runStep, 'What do I go by?'),
  ]);

  const request = ctx.readLastRequest();
  const shortID = String(shortIDs.get(item.itemID));

  expect(JSON.stringify(request?.system)).not.toInclude('Goes by Sam');

  // the item's day is the day the test runs, so the line's day reads as a placeholder
  expect(
    JSON.stringify(request?.messages).replace(/ v1 · \d{1,2} \w{3} · /u, ' v1 · <day> · '),
  ).toMatch(
    new RegExp(
      String.raw`^\[\{"role":"user","content":"<system-message type=\\"pinned-memory\\" id=\\"(?<blockID>[\da-f]{12})\\" at=\\"[^"\\]+\\">\\n[^\\]+\\n- Goes by Sam\\n  ${shortID} v1 · <day> · the owner said this\\n<\/system-message id=\\"\k<blockID>\\">\\n\\n<system-message type=\\"status\\"`,
      'u',
    ),
  );
}, 30_000);

test('it keeps the system prompt the same bytes when a pinned item is edited during a session, and sends the change note before the next message', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [item, runner] = await Promise.all([
    ctx.memory.remember({ text: 'Goes by Sam', isPinned: true, provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'Hello, Sam.' }, { text: 'You go by Sasha now.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Hi.');

  const before = JSON.stringify(ctx.readLastRequest()?.system);

  await ctx.memory.remember({ text: 'Goes by Sasha', target: item, provenance });

  await sendTestMessage(ctx.context, runner.runStep, 'What do I go by?');

  expect(JSON.stringify(ctx.readLastRequest()?.system)).toBe(before);

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toMatch(
    /<system-message type=\\"pinned-memory-changes\\" id=\\"(?<blockID>[\da-f]{12})\\" at=\\"[^"\\]+\\">\\n[^\\]+\\n- Changed \[(?<shortID>[\da-z]+)\]:\\n  - Goes by Sasha\\n    \k<shortID> v2 · [^\\]+ · the owner said this\\n<\/system-message id=\\"\k<blockID>\\">\\n\\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] What do I go by\?/u,
  );
}, 30_000);

test('it rebuilds the session with the recent turns once a replaced sandbox has lost the session', async () => {
  const ctx = await setupTest();

  const [first] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await sendTestMessage(ctx.context, first.runStep, 'Say a fruit.');

  // with every transcript gone, the replacement has no session to carry over
  await Bun.$`find . -name '*.jsonl' -delete`.cwd(ctx.sandboxesDir);

  const second = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  await sendTestMessage(ctx.context, second.runStep, 'Another.');

  const records = await ctx.readRecords();

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toSatisfy(
    (messages: string) =>
      messages.includes(String.raw`<system-message type=\"recent-turns\"`) &&
      messages.includes(String.raw`] owner: Say a fruit.\n[`) &&
      messages.includes(String.raw`] nixie: APPLE\n</system-message id=\"`) &&
      messages.includes(String.raw`, UTC] Another.`),
  );

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
    { payload: { kind: 'rebuild', reason: 'lost', recentRecords: 2 } },
  ]);
}, 30_000);

test('it removes every session file that holds a forgotten item', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key, runner] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),

    // BM25 ranks nothing in an index of 1 or 2 items, so per-turn retrieval needs 3 to place the key
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');

  const held = await collectFilesWithText(`${ctx.dataDir}/sandboxes`, 'blue flowerpot');

  await ctx.memory.forget({ target: key, provenance });

  const left = await collectFilesWithText(`${ctx.dataDir}/sandboxes`, 'blue flowerpot');

  expect(held).toSatisfy((paths: readonly string[]) =>
    paths.some((path) => path.includes('/fs/.claude/projects/')),
  );

  expect(left).toStrictEqual([]);
}, 30_000);

test('it runs the turn after a forget on a rebuilt session without the forgotten item', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key, runner] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),

    // BM25 ranks nothing in an index of 1 or 2 items, so per-turn retrieval needs 3 to place the key
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' }, { text: 'You are welcome.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');

  await ctx.memory.forget({ target: key, provenance });

  await sendTestMessage(ctx.context, runner.runStep, 'Thanks.');

  const records = await ctx.readRecords();

  expect(JSON.stringify(ctx.readLastRequest())).toSatisfy(
    (request: string) => request.includes('Thanks.') && !request.includes('blue flowerpot'),
  );

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
    { payload: { kind: 'rebuild', reason: 'forget' } },
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

test('it resumes the session on a sandbox that a new image replaced between two turns', async () => {
  const ctx = await setupTest();

  const [before] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await sendTestMessage(ctx.context, before.runStep, 'Say a fruit.');

  const after = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  await sendTestMessage(ctx.context, after.runStep, 'Another.');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'sandbox.destroyed')).toHaveLength(1);

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toInclude('APPLE');
}, 30_000);

test('it resumes the session on a sandbox that replaced a retired one between two turns', async () => {
  const ctx = await setupTest();

  const [before] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await sendTestMessage(ctx.context, before.runStep, 'Say a fruit.');

  // as the imp adapter retires an imp that impd still backs up
  const retired = await ctx.retireSandboxes(conversationTaskID);
  const after = await ctx.startRunner({ image: 'nixie-conversation-0123456789ab' });

  await sendTestMessage(ctx.context, after.runStep, 'Another.');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'sandbox.destroyed')
      .map((record) => record.payload['sandboxID']),
  ).toStrictEqual([...retired]);

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);
}, 30_000);

test('it takes the session into a replacement that a stopped start left beside the old sandbox', async () => {
  const ctx = await setupTest();

  const [before] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await sendTestMessage(ctx.context, before.runStep, 'Say a fruit.');

  // the replacement a start made before it stopped, with neither the session copy nor the destroy
  const sandboxes = await ctx.sandboxes.list(conversationTaskID);

  await Promise.all(
    sandboxes.map((old) =>
      ctx.sandboxes.create({ ...old.spec, image: 'nixie-conversation-ba9876543210' }),
    ),
  );

  const after = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  await sendTestMessage(ctx.context, after.runStep, 'Another.');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);
}, 30_000);

test('it wakes a sleeping sandbox to take its session before it replaces it', async () => {
  const ctx = await setupTest();

  const [before] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await sendTestMessage(ctx.context, before.runStep, 'Say a fruit.');

  const [asleep] = await ctx.sandboxes.list(conversationTaskID);

  if (asleep?.suspension.kind !== 'memory') {
    throw new Error('the process double sleeps its sandboxes');
  }

  await asleep.suspension.sleep();

  const after = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  await sendTestMessage(ctx.context, after.runStep, 'Another.');

  expect(ctx.log).not.toHaveBeenCalled();
}, 30_000);

test.skipIf(isRoot)(
  'it starts the new sandbox and the next turn on a fresh session when the session copy fails',
  async () => {
    const ctx = await setupTest();

    const [before] = await Promise.all([
      ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
      createConversationTask(ctx.context),
    ]);

    await sendTestMessage(ctx.context, before.runStep, 'Say a fruit.');

    const transcripts = await collectFilesWithText(ctx.sandboxesDir, 'Say a fruit.');

    // a transcript its guest cannot read fails the copy out of the old sandbox
    await Bun.$`chmod 000 ${transcripts}`.cwd(ctx.sandboxesDir);

    const after = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

    await sendTestMessage(ctx.context, after.runStep, 'Another.');

    const records = await ctx.readRecords();

    expect(ctx.log).toHaveBeenCalledExactlyOnceWith('conversation.session_copy_failed', {
      toSandboxID: expect.toBeString(),
      reason: expect.toInclude('EACCES'),
    });

    expect(
      records.filter(
        (record) => record.kind === 'model.session_opened' && record.payload['kind'] === 'rebuild',
      ),
    ).toHaveLength(1);
  },
  30_000,
);

test('it starts a fresh session on the new sandbox when the old sandbox no longer holds the session', async () => {
  const ctx = await setupTest();

  const [before] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await sendTestMessage(ctx.context, before.runStep, 'Say a fruit.');

  const transcripts = await collectFilesWithText(ctx.sandboxesDir, 'Say a fruit.');

  await Bun.$`rm ${transcripts}`.cwd(ctx.sandboxesDir);

  const after = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  await sendTestMessage(ctx.context, after.runStep, 'Another.');

  const records = await ctx.readRecords();

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('conversation.session_copy_failed', {
    toSandboxID: expect.toBeString(),
    reason: expect.toInclude('holds no transcript'),
  });

  expect(
    records.filter(
      (record) => record.kind === 'model.session_opened' && record.payload['kind'] === 'rebuild',
    ),
  ).toHaveLength(1);
}, 30_000);

test('it gives the next best match the slot of an item the session already holds', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [flowerpot, garage, runner] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.memory.remember({ text: 'A second spare key hangs in the garage', provenance }),
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { retrievalItems: 1 },
    }),
    createConversationTask(ctx.context),

    // BM25 scores a word in half the index at nothing, so both keys need 6 items beside them to
    // pass the score floor
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
    ctx.memory.remember({ text: 'Plays the cello on Thursdays', provenance }),
    ctx.memory.remember({ text: 'Drinks tea without milk', provenance }),
    ctx.memory.remember({ text: 'Was born in Lisbon', provenance }),
    ctx.memory.remember({ text: 'Runs a half marathon each spring', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' }, { text: 'In the garage.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Is the spare key under the blue flowerpot?');
  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...flowerpot }], [{ ...garage }]]);

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toMatch(
    /<system-message type=\\"retrieved-memory\\" id=\\"(?<blockID>[\da-f]{12})\\" at=\\"[^"\\]+\\">\\n[^\\]+\\n- A second spare key hangs in the garage\\n(?:[^<]*\\n)?<\/system-message id=\\"\k<blockID>\\">/u,
  );
}, 30_000);

test('it retrieves an item again after a compaction leaves it out of the session', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key, runner] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab', contextTokens: 100_000 }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  // the tool call reports a context past the window, so the CLI compacts in the second turn
  ctx.model.addReplies(
    { text: 'APPLE' },
    { toolUse: { name: 'mcp__nixie__notes_read', input: {} }, inputTokens: 150_000 },
    { text: 'SUMMARY: the owner asked about a key.' },
    { text: 'BANANA' },
    { text: 'CHERRY' },
  );

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');
  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key again?');
  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key now?');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.compacted')).toHaveLength(1);

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...key }], [], [{ ...key }]]);
}, 30_000);

test('it retrieves an item again on a rebuilt session that lost the turn it came in', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key, first] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  await sendTestMessage(ctx.context, first.runStep, 'Where is the spare key?');

  // with every transcript gone, the replacement has no session to carry over
  await Bun.$`find . -name '*.jsonl' -delete`.cwd(ctx.sandboxesDir);

  const second = await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  await sendTestMessage(ctx.context, second.runStep, 'Where is the spare key again?');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
    { payload: { kind: 'rebuild', reason: 'lost' } },
  ]);

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...key }], [{ ...key }]]);
}, 30_000);

test('it retrieves an edited item even though the session holds its earlier version', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key, runner] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' }, { text: 'Under the doormat.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');

  const edited = await ctx.memory.remember({
    text: 'The spare key sits under the doormat',
    target: key,
    provenance,
  });

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key again?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...key }], [{ ...edited }]]);
}, 30_000);

test("it matches your message to an item on its other words and never on the agent's name", async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [bun, runner] = await Promise.all([
    ctx.memory.remember({ text: 'Switched the server scripts from Node to Bun', provenance }),
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { agentNames: ['Nix', 'Nixie'], ownerName: 'Avery' },
    }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Nix booked the dentist for Tuesday', provenance }),

    // BM25 scores a word in half the index at nothing, so each match needs items beside it to pass
    // the score floor
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
    ctx.memory.remember({ text: 'Plays the cello on Thursdays', provenance }),
    ctx.memory.remember({ text: 'Drinks tea without milk', provenance }),
    ctx.memory.remember({ text: 'Was born in Lisbon', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Bun is quick.' });

  await sendTestMessage(ctx.context, runner.runStep, 'nix, what do you think about bun');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...bun }]]);
}, 30_000);

test("it retrieves nothing for a message that is only the agent's name", async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [runner] = await Promise.all([
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { agentNames: ['Nix', 'Nixie'], ownerName: 'Avery' },
    }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Nix booked the dentist for Tuesday', provenance }),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
    ctx.memory.remember({ text: 'Plays the cello on Thursdays', provenance }),
    ctx.memory.remember({ text: 'Drinks tea without milk', provenance }),
    ctx.memory.remember({ text: 'Was born in Lisbon', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Yes?' });

  await sendTestMessage(ctx.context, runner.runStep, 'nix?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[]]);
}, 30_000);

test('it retrieves nothing for a message that is only your name', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [runner] = await Promise.all([
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { agentNames: ['Nix', 'Nixie'], ownerName: 'Avery' },
    }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Avery swims every Tuesday', provenance }),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
    ctx.memory.remember({ text: 'Plays the cello on Thursdays', provenance }),
    ctx.memory.remember({ text: 'Drinks tea without milk', provenance }),
    ctx.memory.remember({ text: 'Was born in Lisbon', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Hello.' });

  await sendTestMessage(ctx.context, runner.runStep, "It's Avery.");

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[]]);
}, 30_000);
