import { expect, mock, test } from 'bun:test';
import { startTestMemoryStore } from '@heynixie/memory/test-utils';
import { conversationTaskID, createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { startConversation } from './start-conversation';
import { buildConversationDriver } from './test-utils/build-conversation-driver';
import { buildTestModelsConfig } from './test-utils/build-test-models-config';
import { buildTestNotesTools } from './test-utils/build-test-notes-tools';
import { startTestServer } from './test-utils/start-test-server';

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

// a test server on the fake guest, a memory store whose forget cleans up the sessions of the runner
// a test started last, a start that stops the runner before it as a deploy does, and a driver that
// sends your message to the runner last started
async function setupTest(options: TestOptions = {}) {
  const server = await startTestServer(options.tools, { fakeGuest: true });

  const log = mock<Parameters<typeof startConversation>[0]['log']>();
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
    memory,
    log,
    startRunner: async (config: RunnerConfig) => {
      await runners.last?.stop();

      runners.last = await startConversation({
        context,
        models: buildTestModelsConfig({ modelURL: 'http://127.0.0.1:1', ...config }),
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
    conversation: buildConversationDriver({
      context,
      guest: server.guest,
      getRunStep: () => {
        invariant(runners.last);

        return runners.last.runStep;
      },
    }),
  };
}

test('it runs each turn in the conversation guest on the role profile and resumes at the boundary', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.guest.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  const first = await ctx.conversation.send('Say a fruit.');
  const second = await ctx.conversation.send('Another.');
  const records = await ctx.readRecords();

  const replies = records.filter((record) => record.kind === 'model.reply');

  expect(replies).toMatchObject([
    {
      payload: { model: 'claude-test-1', profile: 'chat-direct' },
      erasable: { fields: { text: 'APPLE' } },
    },
    {
      payload: { model: 'claude-test-1', profile: 'chat-direct' },
      erasable: { fields: { text: 'BANANA' } },
    },
  ]);

  expect(first).toMatchObject({
    profile: { model: 'claude-test-1', authHeader: 'x-api-key', effort: 'low' },
  });

  expect(second).toMatchObject({
    profile: { model: 'claude-test-1', authHeader: 'x-api-key', effort: 'low' },
  });

  expect(first.resume).toBeNull();

  // the first turn ended at its reply, which the next turn resumes at
  expect(second).toMatchObject({
    resume: { sessionID: expect.toBeString(), messageID: replies[0]?.payload['messageID'] },
  });
});

test('it resumes the session after a change to the policy alone, and decides the next tool call on the new policy', async () => {
  const notes = buildTestNotesTools('Buy oat milk.');

  const ctx = await setupTest({ tools: notes.tools });

  const callNotes = { toolUse: { name: 'mcp__nixie__notes_read', input: {} } };

  await Promise.all([
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

  ctx.guest.addReplies(callNotes, { text: 'It says oat milk.' }, callNotes, { text: 'I may not.' });

  await ctx.conversation.send('What did my note say?');

  notes.setEffects(['send']);

  const second = await ctx.conversation.send('Read it again.');
  const records = await ctx.readRecords();

  expect({
    opened: records.filter((record) => record.kind === 'model.session_opened'),
    decisions: records
      .filter((record) => record.kind === 'tool_called')
      .map((toolCall) => toolCall.decision),
  }).toMatchObject({
    opened: [{ payload: { kind: 'first', policyHash: 'policy:read' } }],
    decisions: [
      { outcome: 'allow', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
      { outcome: 'deny', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
    ],
  });

  // the second turn resumes the first turn's session instead of rebuilding it
  expect(second.resume).toStrictEqual({
    sessionID: expect.toBeString(),
    messageID: expect.toBeString(),
  });
});

test('it opens a session and passes the context cap of the profile to the guest in its turn', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab', contextTokens: 200_000 }),
    createConversationTask(ctx.context),
  ]);

  ctx.guest.addReplies({ text: 'PLUM' });

  const turn = await ctx.conversation.send('Name a fruit.');
  const records = await ctx.readRecords();

  expect(turn.profile.contextTokens).toBe(200_000);

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);

  expect(records.filter((record) => record.kind === 'model.reply')).toMatchObject([
    { payload: { model: 'claude-test-1' }, erasable: { fields: { text: 'PLUM' } } },
  ]);
});

test('it opens a new session with a pinned item and the line that says where it came from in the first message, and leaves it out of the system prompt', async () => {
  const ctx = await setupTest();

  const [item] = await Promise.all([
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

  ctx.guest.addReplies({ text: 'You go by Sam.' });

  const [shortIDs, turn] = await Promise.all([
    ctx.memory.readShortIDs([item.itemID]),
    ctx.conversation.send('What do I go by?'),
  ]);

  const shortID = String(shortIDs.get(item.itemID));

  expect(turn.systemPrompt).not.toInclude('Goes by Sam');

  // the item's day is the day the test runs, so the line's day reads as a placeholder
  expect(turn.input[0]?.text.replace(/ v1 · \d{1,2} \w{3} · /u, ' v1 · <day> · ')).toMatch(
    new RegExp(
      String.raw`^<system-message type="pinned-memory" id="(?<blockID>[\da-f]{12})" at="[^"]+">\n[^\n]+\nAbout the owner:\n- Goes by Sam\n  ${shortID} v1 · <day> · the owner said this\n<\/system-message id="\k<blockID>">\n\n<system-message type="status"`,
      'u',
    ),
  );
});

test('it keeps the system prompt the same bytes when a pinned item is edited during a session, and sends the change note before the next message', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [item] = await Promise.all([
    ctx.memory.remember({ text: 'Goes by Sam', isPinned: true, provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.guest.addReplies({ text: 'Hello, Sam.' }, { text: 'You go by Sasha now.' });

  const first = await ctx.conversation.send('Hi.');

  await ctx.memory.remember({ text: 'Goes by Sasha', target: item, provenance });

  const second = await ctx.conversation.send('What do I go by?');

  expect(second.systemPrompt).toBe(first.systemPrompt);

  expect(second.input[0]?.text).toMatch(
    /<system-message type="pinned-memory-changes" id="(?<blockID>[\da-f]{12})" at="[^"]+">\n[^\n]+\n- Changed \[(?<shortID>[\da-z]+)\]:\n  - Goes by Sasha\n    \k<shortID> v2 · [^\n]+ · the owner said this\n<\/system-message id="\k<blockID>">\n\n\[#\d+ · \w{3} \d{1,2} \w{3}(?: \d{4})?, \d{2}:\d{2}, UTC\] What do I go by\?/u,
  );
});

test('it rebuilds the session with the recent turns once a replaced sandbox has lost the session', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.guest.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await ctx.conversation.send('Say a fruit.');

  // with every session gone, the replacement has no session to carry over
  ctx.guest.removeSessions(conversationTaskID);

  await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  const turn = await ctx.conversation.send('Another.');
  const records = await ctx.readRecords();

  const opening = turn.input[0]?.text;

  expect(turn.resume).toBeNull();
  expect(opening).toInclude('<system-message type="recent-turns"');
  expect(opening).toInclude('] owner: Say a fruit.\n[');
  expect(opening).toInclude('] nixie: APPLE\n</system-message id="');
  expect(opening).toInclude(', UTC] Another.');

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
    { payload: { kind: 'rebuild', reason: 'lost', recentRecords: 2 } },
  ]);
});

test('it removes every session file that holds a forgotten item', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),

    // BM25 ranks nothing in an index of 1 or 2 items, so per-turn retrieval needs 3 to place the key
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  ctx.guest.addReplies({ text: 'Under the flowerpot.' });

  await ctx.conversation.send('Where is the spare key?');

  const held = ctx.guest.collectFilesWithText('blue flowerpot');

  await ctx.memory.forget({ target: key, provenance });

  const left = ctx.guest.collectFilesWithText('blue flowerpot');

  expect(held).toSatisfy((paths: readonly string[]) =>
    paths.some((path) => path.includes('/.claude/projects/')),
  );

  expect(left).toStrictEqual([]);
});

test('it runs the turn after a forget on a rebuilt session without the forgotten item', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),

    // BM25 ranks nothing in an index of 1 or 2 items, so per-turn retrieval needs 3 to place the key
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  ctx.guest.addReplies({ text: 'Under the flowerpot.' }, { text: 'You are welcome.' });

  await ctx.conversation.send('Where is the spare key?');
  await ctx.memory.forget({ target: key, provenance });

  const turn = await ctx.conversation.send('Thanks.');
  const records = await ctx.readRecords();

  expect(turn.resume).toBeNull();

  expect(JSON.stringify(turn)).toSatisfy(
    (sent: string) => sent.includes('Thanks.') && !sent.includes('blue flowerpot'),
  );

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
    { payload: { kind: 'rebuild', reason: 'forget' } },
  ]);
});

test('it summarizes a session past 0.8 of its window in the guest, and opens the next session from the summary alone', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  // the first turn ends with a context past 0.8 of the 200,000-token window
  ctx.guest.setContextSize(170_000);

  ctx.guest.addReplies(
    { text: 'The gauge reads 3.2 m.' },
    { text: 'It will read 3.4 m.' },
    { text: 'No, that is a normal tide.' },
  );

  await ctx.conversation.send('What does the tide gauge read?');

  // the step this message wakes compacts first, and the next one opens the new session
  const compaction = await ctx.conversation.sendForStep('And tomorrow?');
  const opening = await ctx.conversation.send('Is that high?');
  const records = await ctx.readRecords();

  const summary = 'Summary of the session: 2 entries, the last reply was "The gauge reads 3.2 m.".';

  // the summary call forks the session after the first turn and adds the instruction to it
  expect(compaction.turns).toStrictEqual([]);

  expect(compaction.summaries).toMatchObject([
    {
      resume: { sessionID: expect.toBeString(), messageID: expect.toBeString() },
      instruction: expect.toInclude('nixie is closing this session now'),
    },
  ]);

  expect(opening.resume).toBeNull();
  expect(opening.input[0]?.text).toInclude(summary);
  expect(opening.input[0]?.text).toInclude('And tomorrow?');
  expect(opening.input[0]?.text).not.toInclude('What does the tide gauge read?');
  expect(opening.input[1]?.text).toInclude('Is that high?');

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toMatchObject([
    {
      payload: { trigger: 'threshold', contextSize: expect.toBeWithin(170_000, 171_000) },
      erasable: { fields: { text: summary } },
    },
  ]);
});

test('it compacts a session whose turn overflows the window with its own summary', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  // the second turn's call is refused past the window, and the last two replies answer the two
  // messages on the new session
  ctx.guest.addReplies(
    { text: 'The gauge reads 3.2 m.' },
    { overflow: 'prompt_too_long' },
    { text: 'It will read 3.4 m.' },
    { text: 'No, that is a normal tide.' },
  );

  await ctx.conversation.send('What does the tide gauge read?');

  // the overflowed step compacts and leaves its message unread; the next one opens the new session
  await ctx.conversation.sendForStep('And tomorrow?');

  const opening = await ctx.conversation.send('Is that high?');
  const records = await ctx.readRecords();

  const summary = 'Summary of the session: 2 entries, the last reply was "The gauge reads 3.2 m.".';

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toMatchObject([
    { payload: { trigger: 'overflow' }, erasable: { fields: { text: summary } } },
  ]);

  expect(opening.resume).toBeNull();
  expect(opening.input[0]?.text).toInclude(summary);
  expect(opening.input[0]?.text).toInclude('And tomorrow?');
  expect(opening.input[0]?.text).not.toInclude('What does the tide gauge read?');

  expect(records.filter((record) => record.kind === 'model.reply')).toMatchObject([
    { erasable: { fields: { text: 'The gauge reads 3.2 m.' } } },
    { erasable: { fields: { text: 'It will read 3.4 m.' } } },
    { erasable: { fields: { text: 'No, that is a normal tide.' } } },
  ]);
});

test('it erases the summary when you forget a memory item, and opens the next session with no summary', async () => {
  const ctx = await setupTest();

  const [key] = await Promise.all([
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

  ctx.guest.setContextSize(170_000);
  ctx.guest.addReplies({ text: 'Under the flowerpot.' }, { text: 'You asked about a key.' });

  await ctx.conversation.send('Where is the spare key?');

  // the step this message wakes compacts first and sends no turn
  await ctx.conversation.sendForStep('Thanks.');

  await ctx.memory.forget({
    target: key,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const turn = await ctx.conversation.send('What was I asking about?');
  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toMatchObject([
    { erasable: { status: 'shredded' } },
  ]);

  expect(turn.resume).toBeNull();

  expect(JSON.stringify(turn)).toSatisfy(
    (sent: string) =>
      sent.includes('What was I asking about?') && !sent.includes('Summary of the session'),
  );
});

test('it resumes the session on a sandbox that a new image replaced between two turns', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  ctx.guest.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await ctx.conversation.send('Say a fruit.');
  await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  const turn = await ctx.conversation.send('Another.');
  const records = await ctx.readRecords();

  const reply = records.find((record) => record.kind === 'model.reply');

  expect(records.filter((record) => record.kind === 'sandbox.destroyed')).toHaveLength(1);

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);

  // the new sandbox resumes the first turn's reply, which the old sandbox's session carried over
  expect(turn).toMatchObject({
    resume: { sessionID: expect.toBeString(), messageID: reply?.payload['messageID'] },
  });
});

test('it resumes the session on a sandbox that replaced a retired one between two turns', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await ctx.conversation.send('Say a fruit.');

  // as the imp adapter retires an imp that impd still backs up
  const retired = await ctx.retireSandboxes(conversationTaskID);

  await ctx.startRunner({ image: 'nixie-conversation-0123456789ab' });

  const turn = await ctx.conversation.send('Another.');
  const records = await ctx.readRecords();

  expect(turn.resume).not.toBeNull();

  expect(
    records
      .filter((record) => record.kind === 'sandbox.destroyed')
      .map((record) => record.payload['sandboxID']),
  ).toStrictEqual([...retired]);

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);
});

test('it takes the session into a replacement that a stopped start left beside the old sandbox', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await ctx.conversation.send('Say a fruit.');

  // the replacement a start made before it stopped, with neither the session copy nor the destroy
  const sandboxes = await ctx.sandboxes.list(conversationTaskID);

  await Promise.all(
    sandboxes.map((old) =>
      ctx.sandboxes.create({ ...old.spec, image: 'nixie-conversation-ba9876543210' }),
    ),
  );

  await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  const turn = await ctx.conversation.send('Another.');
  const records = await ctx.readRecords();

  expect(turn.resume).not.toBeNull();

  expect(records.filter((record) => record.kind === 'model.session_opened')).toMatchObject([
    { payload: { kind: 'first' } },
  ]);
});

test('it wakes a sleeping sandbox to take its session before it replaces it', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await ctx.conversation.send('Say a fruit.');

  const [asleep] = await ctx.sandboxes.list(conversationTaskID);

  if (asleep?.suspension.kind !== 'memory') {
    throw new Error('the stub guest sandbox sleeps');
  }

  await asleep.suspension.sleep();
  await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  const turn = await ctx.conversation.send('Another.');

  expect(turn.resume).not.toBeNull();
  expect(ctx.log).not.toHaveBeenCalled();
});

test('it starts the new sandbox and the next turn on a fresh session when the session copy fails', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await ctx.conversation.send('Say a fruit.');

  // the old sandbox cannot read its transcript
  ctx.guest.failCopyOut(conversationTaskID, 'EACCES: permission denied');

  await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  const turn = await ctx.conversation.send('Another.');
  const records = await ctx.readRecords();

  expect(turn.resume).toBeNull();

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('conversation.session_copy_failed', {
    toSandboxID: expect.toBeString(),
    reason: expect.toInclude('EACCES'),
  });

  expect(
    records.filter(
      (record) => record.kind === 'model.session_opened' && record.payload['kind'] === 'rebuild',
    ),
  ).toHaveLength(1);
});

test('it starts a fresh session on the new sandbox when the old sandbox no longer holds the session', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await ctx.conversation.send('Say a fruit.');

  ctx.guest.removeSessions(conversationTaskID);

  await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });

  const turn = await ctx.conversation.send('Another.');
  const records = await ctx.readRecords();

  expect(turn.resume).toBeNull();

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith('conversation.session_copy_failed', {
    toSandboxID: expect.toBeString(),
    reason: expect.toInclude('holds no transcript'),
  });

  expect(
    records.filter(
      (record) => record.kind === 'model.session_opened' && record.payload['kind'] === 'rebuild',
    ),
  ).toHaveLength(1);
});

test('it gives the next best match the slot of an item the session already holds', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [flowerpot, garage] = await Promise.all([
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

  ctx.guest.addReplies({ text: 'Under the flowerpot.' }, { text: 'In the garage.' });

  await ctx.conversation.send('Is the spare key under the blue flowerpot?');

  const turn = await ctx.conversation.send('Where is the spare key?');
  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...flowerpot }], [{ ...garage }]]);

  expect(turn.input[0]?.text).toMatch(
    /<system-message type="retrieved-memory" id="(?<blockID>[\da-f]{12})" at="[^"]+">\n[^\n]+\nAbout the owner:\n- A second spare key hangs in the garage\n(?:[^<]*\n)?<\/system-message id="\k<blockID>">/u,
  );
});

test('it retrieves a matching item of each subject, each under its own heading', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [owner, shared, self] = await Promise.all([
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

  ctx.guest.addReplies({ text: 'Under the flowerpot.' });

  const turn = await ctx.conversation.send('Where is the spare key?');
  const records = await ctx.readRecords();

  const sent = turn.input[0]?.text ?? '';

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .flatMap((record) => record.payload['retrieved']),
  ).toIncludeSameMembers([{ ...owner }, { ...shared }, { ...self }]);

  expect(sent).toInclude('About the owner:\n- The spare key sits under the blue flowerpot');

  expect(sent).toInclude(
    'Between you and the owner:\n- The owner and the assistant call the spare key the brass friend',
  );

  expect(sent).toInclude('- I like the riddle of where the spare key went');
});

test('it retrieves an item again in the session that opens after a compaction', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  // the first turn ends with a context past 0.8 of the window, so the next step compacts
  ctx.guest.setContextSize(170_000);
  ctx.guest.addReplies({ text: 'APPLE' }, { text: 'BANANA' });

  await ctx.conversation.send('Where is the spare key?');

  // the step this message wakes compacts first and sends no turn
  await ctx.conversation.sendForStep('Where is the spare key again?');
  await ctx.conversation.send('Where is the spare key now?');

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'model.session_summarized')).toHaveLength(1);

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...key }], [{ ...key }]]);
});

test('it retrieves an item again on a rebuilt session that lost the turn it came in', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  await ctx.conversation.send('Where is the spare key?');

  // with every session gone, the replacement has no session to carry over
  ctx.guest.removeSessions(conversationTaskID);

  await ctx.startRunner({ image: 'nixie-conversation-ba9876543210' });
  await ctx.conversation.send('Where is the spare key again?');

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
});

test('it retrieves an edited item even though the session holds its earlier version', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [key] = await Promise.all([
    ctx.memory.remember({ text: 'The spare key sits under the blue flowerpot', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  ctx.guest.addReplies({ text: 'Under the flowerpot.' }, { text: 'Under the doormat.' });

  await ctx.conversation.send('Where is the spare key?');

  const edited = await ctx.memory.remember({
    text: 'The spare key sits under the doormat',
    target: key,
    provenance,
  });

  await ctx.conversation.send('Where is the spare key again?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...key }], [{ ...edited }]]);
});

test("it matches your message to an item on its other words and never on the agent's name", async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const [bun] = await Promise.all([
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

  ctx.guest.addReplies({ text: 'Bun is quick.' });

  await ctx.conversation.send('nix, what do you think about bun');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...bun }]]);
});

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

  const [boiler] = await Promise.all([
    ctx.memory.remember({ text: 'The boiler service is booked for the 14th', provenance }),
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'Allergic to hazelnuts', provenance }),
    ctx.memory.remember({ text: 'Prefers window seats on trains', provenance }),
  ]);

  await ctx.memory.waitForSemanticIndex();

  ctx.guest.addReplies({ text: 'On the 14th.' });

  await ctx.conversation.send('When is the heating engineer coming?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...boiler }]]);
});

test("it retrieves nothing for a message that is only the agent's name", async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await Promise.all([
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

  ctx.guest.addReplies({ text: 'Yes?' });

  await ctx.conversation.send('nix?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[]]);
});

test('it retrieves nothing for a message that is only your name', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await Promise.all([
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

  ctx.guest.addReplies({ text: 'Hello.' });

  await ctx.conversation.send("It's Avery.");

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[]]);
});

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
  await Promise.all([
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

  ctx.guest.addReplies({ text: 'Mint, then.' });

  const turn = await ctx.conversation.send('Which tea should I try?');

  const opening = turn.input[0]?.text ?? '';

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
});

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
  await Promise.all([
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { retrievalMinScore: 0 },
    }),
    createConversationTask(ctx.context),
  ]);

  const [smell, calming, , ...facts] = await Promise.all([
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

  ctx.guest.addReplies({ text: 'Mint, then.' });

  await ctx.conversation.send('Which tea should I try?');

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
});

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
  const [kettle] = await Promise.all([
    ctx.memory.remember({ text: 'Keeps a tin of tea by the kettle', provenance }),
    ctx.startRunner({
      image: 'nixie-conversation-0123456789ab',
      memorySettings: { retrievalSelfNotes: 0, retrievalMinScore: 0 },
    }),
    createConversationTask(ctx.context),
    ctx.memory.remember({ text: 'I find tea calming', provenance: note, subject: 'self' }),
  ]);

  ctx.guest.addReplies({ text: 'Mint, then.' });

  const turn = await ctx.conversation.send('Which tea should I try?');
  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrieved']),
  ).toStrictEqual([[{ ...kettle }]]);

  expect(turn.input[0]?.text).not.toInclude('retrieved-self-notes');
});

test('it places at most 3 of your past messages that match a new message by meaning, each with its thread and day', async () => {
  const ctx = await setupTest({
    encoderTopics: [['boiler', 'heating', 'radiator', 'furnace', 'engineer'], ['hazelnuts']],
  });

  await Promise.all([
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

  ctx.guest.addReplies({ text: 'On Friday.' });

  const turn = await ctx.conversation.send('When is the heating engineer coming?');
  const records = await ctx.readRecords();

  const matching = expect.toBeOneOf([clanks, cold, booked, old]);

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrievedMessages']),
  ).toStrictEqual([[matching, matching, matching]]);

  expect(turn.input[0]?.text).toMatch(
    /<system-message type="retrieved-messages" id="(?<blockID>[\da-f]{12})" at="[^"]+">\nEarlier messages from the owner [^\n]+\n- \d{1,2} [A-Z][a-z]{2} · thread garden · event \d+\n {2}[^\n]+\n- [^<]+<\/system-message id="\k<blockID>">/u,
  );
});

test('it leaves out a past message that the session already holds and places the next match', async () => {
  const ctx = await setupTest({
    encoderTopics: [['boiler', 'heating', 'furnace', 'engineer'], ['hazelnuts']],
  });

  await Promise.all([
    ctx.startRunner({ image: 'nixie-conversation-0123456789ab' }),
    createConversationTask(ctx.context),
  ]);

  await ctx.memory.waitForSemanticIndex();

  ctx.guest.addReplies({ text: 'That sounds loud.' }, { text: 'On Friday.' });

  await ctx.conversation.send('The boiler clanks at night');

  const booked = await ctx.writeOwnerMessages('garden', ['Booked the furnace check for Friday']);

  await ctx.conversation.send('When is the heating engineer coming?');

  const records = await ctx.readRecords();

  expect(
    records
      .filter((record) => record.kind === 'model.turn_ended')
      .map((record) => record.payload['retrievedMessages']),
  ).toStrictEqual([[], booked]);
});
