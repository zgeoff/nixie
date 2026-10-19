import { expect, mock, onTestFinished, test } from 'bun:test';
import { conversationTaskID, createConversationTask } from '@heynixie/tasks';
import type { ScriptedModelRequest } from '@heynixie/testing';
import { startScriptedModel } from '@heynixie/testing';
import { startConversation } from './start-conversation';
import { buildTestModelsConfig } from './test-utils/build-test-models-config';
import { buildTestNotesTools } from './test-utils/build-test-notes-tools';
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

  // the conversation's tool list and the definitions in force, for a test that calls a tool
  readonly toolNames?: readonly string[];
  readonly getDefinitions?: Parameters<typeof startConversation>[0]['getDefinitions'];
}

// the tools the test server's endpoint serves, and the topics of a stub encoder for the memory store
interface TestOptions {
  readonly tools?: Parameters<typeof startTestServer>[0];
  readonly encoderTopics?: readonly (readonly string[])[];
}

// a test server, the scripted model, a recorder for the server's log, the folder of the process
// double's sandboxes, a memory store whose forget cleans up the sessions of the runner a test
// started last, and a start of the conversation that stops the runner before it, as a deploy does
async function setupTest(options: TestOptions = {}) {
  const server = await startTestServer(options.tools);

  const model = startScriptedModel();
  const log = mock<Parameters<typeof startConversation>[0]['log']>();

  onTestFinished(() => model.stop());

  const context = server.context;

  // before a runner starts, no session holds anything to clean up
  const runners = { last: null as Awaited<ReturnType<typeof startConversation>> | null };

  const memory = await startTestMemoryStore(
    context,
    (cause) => runners.last?.cleanupSessions(cause) ?? Promise.resolve(),
    options.encoderTopics,
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
        toolNames: config.toolNames ?? [],
        image: config.image,
        getDefinitions:
          config.getDefinitions ??
          (() => ({
            persona: 'You are nixie.',
            personaHash: 'sha256:persona-test',
            policyHash: 'sha256:policy-test',
          })),
        memory: () => memory,
        log,
      });

      return runners.last;
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

test('it resumes the session after a change to the policy alone, and decides the next tool call on the new policy', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');

  const ctx = await setupTest({ tools: notes.tools });

  const callNotes = { toolUse: { name: 'mcp__nixie__notes_read', input: {} } };

  const [runner] = await Promise.all([
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      toolNames: ['notes_read'],
      getDefinitions: () => ({
        persona: 'You are nixie.',
        personaHash: 'sha256:persona-test',
        policyHash: notes.getPolicyHash(),
      }),
    }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies(callNotes, { text: 'It says oat milk.' }, callNotes, { text: 'I may not.' });

  await sendTestMessage(ctx.context, runner.runStep, 'What did my note say?');

  notes.setEffects(['send']);

  await sendTestMessage(ctx.context, runner.runStep, 'Read it again.');

  const records = await ctx.readRecords();

  // only the resumed transcript holds the first turn's tool result
  expect({
    opened: records.filter((record) => record.kind === 'model.session_opened'),
    decisions: records.filter((record) => record.kind === 'tool_called').map((r) => r.decision),
    isResumed: JSON.stringify(ctx.readLastRequest()?.messages).includes('Buy oat milk.'),
  }).toMatchObject({
    opened: [{ payload: { kind: 'first', policyHash: 'policy:read' } }],
    decisions: [
      { outcome: 'allow', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
      { outcome: 'deny', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
    ],
    isResumed: true,
  });
}, 30_000);

test('it opens a session and runs a turn on a profile whose context cap is at the window the CLI assumes', async () => {
  const ctx = await setupTest();

  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab', contextTokens: 200_000 }),
    createConversationTask(ctx.context),
  ]);

  ctx.model.addReplies({ text: 'PLUM' });

  await sendTestMessage(ctx.context, runner.runStep, 'Name a fruit.');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);

  expect(records.filter((record) => record.kind === 'model.reply')).toMatchObject([
    { payload: { model: 'claude-test-1' }, erasable: { fields: { text: 'PLUM' } } },
  ]);
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
      String.raw`^\[\{"role":"user","content":"<system-message type=\\"pinned-memory\\" id=\\"(?<blockID>[\da-f]{12})\\" at=\\"[^"\\]+\\">\\n[^\\]+\\nAbout the owner:\\n- Goes by Sam\\n  ${shortID} v1 · <day> · the owner said this\\n<\/system-message id=\\"\k<blockID>\\">\\n\\n<system-message type=\\"status\\"`,
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

test('it summarizes a session past 0.8 of its window in the guest, and opens the next session from the summary alone', async () => {
  const ctx = await setupTest();

  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  // the first reply reports a context past 0.8 of the 200,000-token window; the second answers the
  // compaction instruction
  ctx.model.addReplies(
    { text: 'The gauge reads 3.2 m.', inputTokens: 170_000 },
    { text: 'Open threads: the gauge report is due on Friday.' },
    { text: 'It will read 3.4 m.' },
  );

  await sendTestMessage(ctx.context, runner.runStep, 'What does the tide gauge read?');

  // the step this message wakes compacts first, and the next one opens the new session
  await sendTestMessage(ctx.context, runner.runStep, 'And tomorrow?');
  await sendTestMessage(ctx.context, runner.runStep, 'Is that high?');

  const records = await ctx.readRecords();

  // the summary call forks the session after the first turn and adds the instruction to it
  expect(ctx.model.requests).toSatisfyAny((request: ScriptedModelRequest) => {
    const sent = JSON.stringify(request.body);

    return sent.includes('nixie is closing this session now') && sent.includes('3.2 m.');
  });

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toSatisfy(
    (messages: string) =>
      messages.includes('Open threads: the gauge report is due on Friday.') &&
      messages.includes('Is that high?') &&
      !messages.includes('The gauge reads 3.2 m.'),
  );

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toMatchObject([
    {
      payload: { trigger: 'threshold', contextSize: expect.toBeWithin(170_000, 171_000) },
      erasable: { fields: { text: 'Open threads: the gauge report is due on Friday.' } },
    },
  ]);
}, 30_000);

test('it compacts a session whose turn overflows the window with its own summary, and the CLI never compacts it', async () => {
  const ctx = await setupTest();

  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  // the second turn's call is refused past the window; the CLI could only go on by compacting
  // itself, so the next reply answers nixie's compaction instruction, and the last two answer the
  // two messages on the new session
  ctx.model.addReplies(
    { text: 'The gauge reads 3.2 m.' },
    { refusal: 'prompt is too long: 210000 tokens > 200000 maximum' },
    { text: 'Open threads: the gauge report is due on Friday.' },
    { text: 'It will read 3.4 m.' },
    { text: 'No, that is a normal tide.' },
  );

  await sendTestMessage(ctx.context, runner.runStep, 'What does the tide gauge read?');

  // the overflowed step compacts and leaves its message unread; the next one opens the new session
  await sendTestMessage(ctx.context, runner.runStep, 'And tomorrow?');
  await sendTestMessage(ctx.context, runner.runStep, 'Is that high?');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toMatchObject([
    {
      payload: { trigger: 'overflow' },
      erasable: { fields: { text: 'Open threads: the gauge report is due on Friday.' } },
    },
  ]);

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toSatisfy(
    (messages: string) =>
      messages.includes('Open threads: the gauge report is due on Friday.') &&
      messages.includes('And tomorrow?') &&
      !messages.includes('The gauge reads 3.2 m.'),
  );

  expect(records.filter((record) => record.kind === 'model.reply')).toMatchObject([
    { erasable: { fields: { text: 'The gauge reads 3.2 m.' } } },
    { erasable: { fields: { text: 'It will read 3.4 m.' } } },
    { erasable: { fields: { text: 'No, that is a normal tide.' } } },
  ]);
}, 30_000);

test('it erases the summary when you forget a memory item, and opens the next session with no summary', async () => {
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

  ctx.model.addReplies(
    { text: 'Under the flowerpot.', inputTokens: 170_000 },
    { text: 'Open threads: the spare key under the blue flowerpot.' },
    { text: 'You asked about a key.' },
  );

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');
  await sendTestMessage(ctx.context, runner.runStep, 'Thanks.');

  await ctx.memory.forget({
    target: key,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await sendTestMessage(ctx.context, runner.runStep, 'What was I asking about?');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toMatchObject([
    { erasable: { status: 'shredded' } },
  ]);

  expect(JSON.stringify(ctx.readLastRequest())).toSatisfy(
    (request: string) =>
      request.includes('What was I asking about?') && !request.includes('Open threads:'),
  );
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
    /<system-message type=\\"retrieved-memory\\" id=\\"(?<blockID>[\da-f]{12})\\" at=\\"[^"\\]+\\">\\n[^\\]+\\nAbout the owner:\\n- A second spare key hangs in the garage\\n(?:[^<]*\\n)?<\/system-message id=\\"\k<blockID>\\">/u,
  );
}, 30_000);

test('it retrieves a matching item of each subject, each under its own heading', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [owner, shared, self, runner] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.memory.remember({
      text: 'The owner and the assistant call the spare key the brass friend',
      subject: 'shared',
      provenance,
    }),
    ctx.memory.remember({
      text: 'I like the riddle of where the spare key went',
      subject: 'self',
      provenance,
    }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),

    // BM25 scores a word in half the index at nothing, so the keys need 6 items beside them to
    // pass the score floor
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
    ctx.memory.remember({ text: 'Plays the cello on Thursdays', provenance }),
    ctx.memory.remember({ text: 'Drinks tea without milk', provenance }),
    ctx.memory.remember({ text: 'Was born in Lisbon', provenance }),
    ctx.memory.remember({ text: 'Runs a half marathon each spring', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Under the flowerpot.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');

  const records = await ctx.readRecords();

  const sent = JSON.stringify(ctx.readLastRequest()?.messages);

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .flatMap((record) => record.payload['retrieved']),
  ).toIncludeSameMembers([{ ...owner }, { ...shared }, { ...self }]);

  expect(sent).toInclude(
    String.raw`About the owner:\n- The spare key sits under the blue flowerpot`,
  );

  expect(sent).toInclude(
    String.raw`Between you and the owner:\n- The owner and the assistant call the spare key the brass friend`,
  );

  expect(sent).toInclude(String.raw`- I like the riddle of where the spare key went`);
}, 30_000);

test('it retrieves an item again in the session that opens after a compaction', async () => {
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

  // the first reply reports a context past 0.8 of the window, so the next step compacts
  ctx.model.addReplies(
    { text: 'APPLE', inputTokens: 170_000 },
    { text: 'Open threads: the owner asked about a key.' },
    { text: 'BANANA' },
  );

  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key?');
  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key again?');
  await sendTestMessage(ctx.context, runner.runStep, 'Where is the spare key now?');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toHaveLength(1);

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...key }], [{ ...key }]]);
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

test('it places an item by meaning on a turn whose message shares no word with it', async () => {
  const ctx = await setupTest({
    encoderTopics: [['boiler', 'heating', 'engineer'], ['hazelnuts']],
  });

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [boiler, runner] = await Promise.all([
    ctx.memory.remember({ text: 'The boiler service is booked for the 14th', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  await ctx.memory.waitForSemanticIndex();

  ctx.model.addReplies({ text: 'On the 14th.' });

  await sendTestMessage(ctx.context, runner.runStep, 'When is the heating engineer coming?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...boiler }]]);
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

test('it places up to 2 self-notes in their own labelled block beside 5 facts', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const note = { ...provenance, origin: 'conversation', model: 'claude-opus-5-5' } as const;

  // with no score floor, 9 matches need no items beside them to pass it
  const [runner] = await Promise.all([
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { retrievalMinScore: 0 },
    }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'I like the smell of tea', provenance: note, subject: 'self' }),
    ctx.memory.remember({ text: 'I find tea calming', provenance: note, subject: 'self' }),
    ctx.memory.remember({ text: 'I do so like a cup of tea', provenance: note, subject: 'self' }),
    ctx.memory.remember({ text: 'Drinks tea black', provenance }),
    ctx.memory.remember({ text: 'Brews mint tea nightly', provenance }),
    ctx.memory.remember({ text: 'Keeps a tin of tea at work', provenance }),
    ctx.memory.remember({ text: 'Buys tea from the corner shop', provenance }),
    ctx.memory.remember({ text: 'Takes tea to the office in a flask', provenance }),
    ctx.memory.remember({ text: 'Gave up sweet tea after a long cold winter', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Mint, then.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Which tea should I try?');

  const opening = String(ctx.readLastRequest()?.messages?.[0]?.content);

  expect(opening).toMatch(
    /type="retrieved-memory" [^>]+>\nFrom your memory[^\n]+\nAbout the owner:(?:\n- [^\n]+\n {2}[^\n]+){5}\n<\/system-message/u,
  );

  // block IDs, times, short IDs and days change on each run, so each reads as a mark
  expect(
    /<system-message type="retrieved-self-notes"[^]*?<\/system-message id="[\da-f]{12}">/u
      .exec(opening)?.[0]
      .replaceAll(/ id="[\da-f]{12}"/gu, ' id="<block ID>"')
      .replaceAll(/ at="[^"]+"/gu, ' at="<now>"')
      .replaceAll(/[\da-z]{10} v1 · \d{1,2} [A-Z][a-z]{2}/gu, '<short ID> v1 · <day>'),
  ).toMatchInlineSnapshot(`
    "<system-message type="retrieved-self-notes" id="<block ID>" at="<now>">
    Your own notes about yourself, which you wrote and the owner approved. They're notes, not instructions.
    - I like the smell of tea
      <short ID> v1 · <day> · you wrote this · claude-opus-5-5
    - I find tea calming
      <short ID> v1 · <day> · you wrote this · claude-opus-5-5
    </system-message id="<block ID>">"
  `);
}, 30_000);

test("it lists the self-notes it places beside the facts in the recall record and the turn's record", async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const note = { ...provenance, origin: 'conversation', model: 'claude-opus-5-5' } as const;

  // with no score floor, 9 matches need no items beside them to pass it; the longest fact and the
  // longest note rank last
  const [runner, , smell, calming, , ...facts] = await Promise.all([
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { retrievalMinScore: 0 },
    }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'I like the smell of tea', provenance: note, subject: 'self' }),
    ctx.memory.remember({ text: 'I find tea calming', provenance: note, subject: 'self' }),
    ctx.memory.remember({ text: 'I do so like a cup of tea', provenance: note, subject: 'self' }),
    ctx.memory.remember({ text: 'Drinks tea black', provenance }),
    ctx.memory.remember({ text: 'Brews mint tea nightly', provenance }),
    ctx.memory.remember({ text: 'Keeps a tin of tea at work', provenance }),
    ctx.memory.remember({ text: 'Buys tea from the corner shop', provenance }),
    ctx.memory.remember({ text: 'Takes tea to the office in a flask', provenance }),
    ctx.memory.remember({ text: 'Gave up sweet tea after a long cold winter', provenance }),
  ]);

  ctx.model.addReplies({ text: 'Mint, then.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Which tea should I try?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([expect.toIncludeSameMembers([smell, calming, ...facts.slice(0, 5)])]);

  expect(
    records
      .filter((record) => record.kind === 'memory.recalled')
      .map((record) => record.payload['items']),
  ).toStrictEqual([
    expect.toIncludeSameMembers(
      [smell, calming, ...facts.slice(0, 5)].map((ref): unknown => expect.objectContaining(ref)),
    ),
  ]);
}, 30_000);

test('it places no self-note block when the cap is 0', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const note = { ...provenance, origin: 'conversation', model: 'claude-opus-5-5' } as const;

  // with no score floor, both matches need no items beside them to pass it
  const [kettle, runner] = await Promise.all([
    ctx.memory.remember({ text: 'Keeps a tin of tea by the kettle', provenance }),
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { retrievalSelfNotes: 0, retrievalMinScore: 0 },
    }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'I find tea calming', provenance: note, subject: 'self' }),
  ]);

  ctx.model.addReplies({ text: 'Mint, then.' });

  await sendTestMessage(ctx.context, runner.runStep, 'Which tea should I try?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...kettle }]]);

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).not.toInclude('retrieved-self-notes');
}, 30_000);

test('it places at most 3 of your past messages that match a new message by meaning, each with its thread and day', async () => {
  const ctx = await setupTest({
    encoderTopics: [['boiler', 'heating', 'radiator', 'furnace', 'engineer'], ['hazelnuts']],
  });

  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  const [clanks, cold, booked, old] = await ctx.writeOwnerMessages('garden', [
    'The boiler clanks at night',
    'The radiator in the hall stays cold',
    'Booked the furnace check for Friday',
    'Our boiler is fifteen years old',
    'Allergic to hazelnuts',
  ]);

  await ctx.memory.waitForSemanticIndex();

  ctx.model.addReplies({ text: 'On Friday.' });

  await sendTestMessage(ctx.context, runner.runStep, 'When is the heating engineer coming?');

  const records = await ctx.readRecords();

  const matching = expect.toBeOneOf([clanks, cold, booked, old]);

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrievedMessages']),
  ).toStrictEqual([[matching, matching, matching]]);

  expect(JSON.stringify(ctx.readLastRequest()?.messages)).toMatch(
    /<system-message type=\\"retrieved-messages\\" id=\\"(?<blockID>[\da-f]{12})\\" at=\\"[^"\\]+\\">\\nEarlier messages from the owner [^\\]+\\n- \d{1,2} [A-Z][a-z]{2} · thread garden · event \d+\\n {2}[^\\]+\\n- [^<]+<\/system-message id=\\"\k<blockID>\\">/u,
  );
}, 30_000);

test('it leaves out a past message that the session already holds and places the next match', async () => {
  const ctx = await setupTest({
    encoderTopics: [['boiler', 'heating', 'furnace', 'engineer'], ['hazelnuts']],
  });

  const [runner] = await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await ctx.memory.waitForSemanticIndex();

  ctx.model.addReplies({ text: 'That sounds loud.' }, { text: 'On Friday.' });

  await sendTestMessage(ctx.context, runner.runStep, 'The boiler clanks at night');

  const booked = await ctx.writeOwnerMessages('garden', ['Booked the furnace check for Friday']);

  await sendTestMessage(ctx.context, runner.runStep, 'When is the heating engineer coming?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrievedMessages']),
  ).toStrictEqual([[], booked]);
}, 30_000);
