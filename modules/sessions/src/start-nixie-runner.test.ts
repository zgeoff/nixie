import { expect, onTestFinished, test } from 'bun:test';
import { readLinkTarget } from '@heynixie/connectors';
import { seedWebFetchLinks } from '@heynixie/connectors/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import {
  claimTask,
  runTaskStep,
  taskLimitNoticeCodec,
  writeInboxRecords,
  writeStepCommit,
  writeTaskControl,
  writeTaskLimitRaise,
} from '@heynixie/tasks';
import type { ConversationStep, StartedTaskSeed } from '@heynixie/tasks/test-utils';
import {
  seedConversationStep,
  seedStartedTask,
  writeTestTaskMessage,
} from '@heynixie/tasks/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import type { NixieRunnerOptions } from './start-nixie-runner';
import { startNixieRunner } from './start-nixie-runner';
import { buildStubMemory } from './test-utils/build-stub-memory';
import { buildStubToolEndpoint } from './test-utils/build-stub-tool-endpoint';
import { readRecordsByKind } from './test-utils/read-records-by-kind';
import { runNextStep } from './test-utils/run-next-step';
import { startTestSessionHost } from './test-utils/start-test-session-host';

async function setupTest() {
  const host = await startTestSessionHost();

  const tools = buildStubToolEndpoint();
  const events: string[] = [];

  const noMemory = buildStubMemory({
    pinned: [],
    pinnedUse: { items: 0, tokens: 0, budget: 2000 },
  });

  const startRunner = async (parts: Partial<Pick<NixieRunnerOptions, 'tools' | 'memory'>> = {}) => {
    const runner = await startNixieRunner({
      context: host.context,
      models: modelsConfigSchema.parse({
        profiles: {
          'chat-direct': {
            harness: 'agent-sdk',
            base_url: 'https://models.example.test',
            credential: 'deployment:anthropic',
            auth_header: 'x-api-key',
            model: 'claude-test-1',
            effort: 'low',
          },
          errands: {
            harness: 'agent-sdk',
            base_url: 'https://models.example.test',
            credential: 'deployment:anthropic',
            auth_header: 'x-api-key',
            model: 'claude-test-errands',
            effort: 'low',
            context_tokens: 200_000,
            prices: { input: 0, cache_write: 0, cache_write_1h: 0, cached_input: 0, output: 0 },
          },
          'router-b': {
            harness: 'agent-sdk',
            base_url: 'https://router.example.test/anthropic',
            credential: 'deployment:router',
            auth_header: 'bearer',
            model: 'other-family-test-3',
            effort: 'low',
            prices: { input: 3, cache_write: 3, cache_write_1h: 3, cached_input: 0.3, output: 15 },
          },
        },
        roles: { conversation: 'chat-direct', task: 'errands' },
        selectable: {
          'second-look': { profile: 'router-b', description: 'Another family' },
        },
      }),
      secrets: { model_credentials: { anthropic: 'not-a-real-key', router: 'not-a-real-token' } },
      sandboxes: host.sandboxes,
      images: { conversation: 'nixie-conversation-0123456789ab' },
      tools: parts.tools ?? tools.endpoint,
      memory: parts.memory ?? (() => noMemory),
      getDefinitions: () => ({
        persona: 'You are Pip.',
        prompts: {},
        personaHash: 'sha256:persona-test',
        policyHash: 'sha256:policy-test',
      }),
      memorySettings: {
        retrievalItems: 5,
        retrievalSelfNotes: 2,
        retrievalMessages: 3,
        retrievalMinScore: 0.25,
        retrievalMinSimilarity: 0.38,
        rebuildTokens: 30_000,
        ownerName: 'Robin',
        agentNames: [],
      },
      compaction: { threshold: 0.8, headsUp: 0.7, summaryTokens: 2000 },
      defaultZone: 'UTC',
      messaging: { directory: [], hopLimit: 20, ownerName: 'Robin' },
      log: (event) => {
        events.push(event);
      },
    });

    host.defer(() => runner.stop());

    return runner;
  };

  return {
    ...host,
    runs: tools.runs,
    steps: tools.steps,
    events,
    startRunner,
    seedConversationStep: () => seedConversationStep(host.context),
    seedTask: (starter: ConversationStep, options: StartedTaskSeed['options'] = {}) =>
      seedStartedTask(host.context, {
        starter: starter.claim,
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
        options,
      }),
    writeMessage: (taskID: string, text: string) =>
      writeInboxRecords(host.context, [
        {
          kind: 'owner_message',
          definitions: host.context.definitions(),
          thread: taskID,
          erasable: { text },
        },
      ]),
    writeTaskMessage: (taskID: string, body: string) =>
      writeInboxRecords(host.context, [
        {
          kind: 'task_message',
          definitions: host.context.definitions(),
          thread: taskID,
          payload: {
            messageID: 'q8v3m1x7ka',
            from: 'conversation',
            to: taskID,
            kind: 'request',
            replyTo: null,
            onBehalfOf: [],
            hop: 1,
            hopLimit: 20,
            wake: true,
            woke: true,
            source: 'task:conversation',
          },
          erasable: { body },
        },
      ]),
    runNextStep: (runner: Awaited<ReturnType<typeof startRunner>>) =>
      runNextStep(host.context, runner.runStep),
    runNextStepWithNoRetryDelay: async (runner: Awaited<ReturnType<typeof startRunner>>) => {
      const claim = await claimTask(host.context, { holder: 'runner-a', leaseMs: 60_000 });

      invariant(claim !== null, 'a task has work to claim');

      await runTaskStep(host.context, claim, {
        runStep: runner.runStep,
        leaseMs: 60_000,
        maxStepErrors: 3,
        retryDelayMs: 0,
        maxRetryDelayMs: 0,
      });
    },
    readKinds: (kind: string) => readRecordsByKind(host.context.log, kind),
  };
}

test.each([
  {
    name: 'a task report',
    kind: 'task_message',
    buildPayload: (taskID: string) => ({
      messageID: 'q8v3m1x7ka',
      from: 'conversation',
      to: taskID,
      kind: 'report',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:conversation',
    }),
    erasable: { body: 'The ferry runs at 09:25.' },
  },
  {
    name: 'a timer',
    kind: 'timer.fired',
    buildPayload: (taskID: string) => ({
      timerID: 'tide-check',
      taskID,
      dueAt: 1000,
      firedAt: 1000,
    }),
    erasable: {},
  },
])(
  'it ends a task turn that $name alone woke with no reply and no task message, and records the turn end as silent',
  async (row) => {
    const ctx = await setupTest();
    const starter = await ctx.seedConversationStep();
    const taskID = await ctx.seedTask(starter);
    const runner = await ctx.startRunner();

    await ctx.runNextStep(runner);

    const repliesBefore = await ctx.readKinds('model.reply');

    const ends: (string | undefined)[] = [];

    ctx.guest.addReplies({
      text: 'Nothing new on the tides.',
      gate: () => {
        ends.push(ctx.steps.at(-1)?.session?.endSilently?.());

        return Promise.resolve();
      },
    });

    await writeInboxRecords(ctx.context, [
      {
        kind: row.kind,
        definitions: ctx.context.definitions(),
        thread: taskID,
        payload: row.buildPayload(taskID),
        erasable: row.erasable,
      },
    ]);

    await ctx.runNextStep(runner);

    const replies = await ctx.readKinds('model.reply');
    const sent = await ctx.readKinds('task_message');
    const ended = await ctx.readKinds('model.turn_ended');

    expect(ends).toStrictEqual(['ended']);
    expect(replies).toStrictEqual(repliesBefore);
    expect(sent.filter((record) => record.thread !== taskID)).toStrictEqual([]);

    expect(ended.at(-1)).toStrictEqual({
      sequence: expect.any(Number),
      recordedAt: expect.any(Date),
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: taskID,
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: {
        model: 'claude-test-errands',
        profile: 'errands',
        stopReason: 'end_turn',
        turns: 1,
        inputTokens: expect.any(Number),
        outputTokens: expect.any(Number),
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        contextSize: expect.any(Number),
        contextWindow: 200_000,
        pinnedCore: [],
        retrieved: [],
        retrievedMessages: [],
        invalidatedThrough: 0,
        sessionImageBytes: 0,
        sessionImageCount: 0,
        recalledThrough: 0,
        isSilent: true,
      },
      erasable: { status: 'none' },
    });
  },
);

test('it refuses to end a task turn that holds a message from you silently, and records its reply', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const ends: (string | undefined)[] = [];

  ctx.guest.addReplies({
    text: 'The morning tide is at 06:10.',
    gate: () => {
      ends.push(ctx.steps.at(-1)?.session?.endSilently?.());

      return Promise.resolve();
    },
  });

  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  const replies = await ctx.readKinds('model.reply');

  expect(ends).toStrictEqual(['refused']);

  expect(replies.at(-1)).toStrictEqual({
    sequence: expect.any(Number),
    recordedAt: expect.any(Date),
    kind: 'model.reply',
    definitions: { snapshotHash: 'sha256:test' },
    thread: taskID,
    stepKey: null,
    parent: null,
    contentSource: null,
    decision: null,
    promptCause: null,
    approval: null,
    payload: {
      model: 'claude-test-errands',
      profile: 'errands',
      messageID: expect.any(String),
    },
    erasable: { status: 'readable', fields: { text: 'The morning tide is at 06:10.' } },
  });
});

test("it runs a started task's first step in a worker imp that the task owns", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const sandboxes = await ctx.sandboxes.list(taskID);

  expect(sandboxes.map((sandbox) => sandbox.spec)).toStrictEqual([
    {
      kind: 'worker',
      image: 'nixie-conversation-0123456789ab',
      owner: taskID,
      egress: { kind: 'none' },
      grants: [expect.objectContaining({ host: 'models.example.test' })],
      toolRoute: true,
      limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 4096 },
    },
  ]);
});

test("it runs a started task's tool run on its own ID with the tools it is given, the silent end and the task role's model", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs).toStrictEqual([
    {
      toolUseMetaKey: 'claudecode/toolUseId',
      runID: taskID,
      thread: taskID,
      tools: ['tasks.list', 'task.message', 'time.now', 'turn.end_silently'],
      model: { model: 'claude-test-errands', profile: 'errands' },
    },
  ]);
});

test("it opens a started task's first session under the task prompt, with a start note as its input and no persona or memory", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(turn?.profile.model).toBe('claude-test-errands');

  expect(turn?.systemPrompt).toStartWith(
    'You are "Tide tables", one of the tasks that nixie runs for Robin.',
  );

  expect(turn?.systemPrompt).not.toInclude('You are Pip.');
  expect(input).toInclude('<system-message type="task-start"');
  expect(input).toInclude('send it with task.message to conversation');
  expect(input).not.toInclude('pinned-memory');
  expect(ctx.guest.received.map((received) => received.owner)).toStrictEqual([taskID]);
});

test('it sleeps the imp of a step that waits, and wakes the same imp for the next message', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  const slept = await ctx.readKinds('sandbox.slept');
  const woken = await ctx.readKinds('sandbox.woken');

  const turnSandboxes = new Set(ctx.guest.received.map((received) => received.sandboxID));

  expect(slept).toHaveLength(2);
  expect(woken).toHaveLength(1);
  expect(turnSandboxes.size).toBe(1);
});

test('it resumes the same session for the next message', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  const [first, second] = ctx.guest.turns;

  expect(second?.resume?.sessionID).toBeString();
  expect(first?.resume).toBeNull();
});

test("it starts a task's tool run again on the step after a start that failed", async () => {
  const ctx = await setupTest();

  const failing = buildStubToolEndpoint({ failedStarts: 1 });

  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter);

  const runner = await ctx.startRunner({ tools: failing.endpoint });

  await ctx.runNextStepWithNoRetryDelay(runner);
  await ctx.runNextStep(runner);

  expect(ctx.guest.turns).toHaveLength(1);
});

test('it destroys the imp of an idle task when the task closes, with no further step', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  await writeTaskControl(ctx.context, { taskID, control: 'close' });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(taskID);

    return sandboxes.length === 0;
  });

  expect(ctx.guest.turns).toHaveLength(1);
});

test("it compacts a started task's session under the task prompt, with its name and brief and no persona", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter);

  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const prompts = ctx.guest.summaries.map((summary) => summary.systemPrompt);

  expect(prompts).toStrictEqual([
    expect.stringContaining('You are "Tide tables", one of the tasks that nixie runs'),
  ]);

  expect(prompts.join('')).toInclude('Find the high tides for Saturday.');
  expect(prompts.join('')).not.toInclude('You are Pip.');
});

test('it commits a step whose imp fails to sleep, with no step error', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  ctx.guest.failSleep(taskID, 'the snapshot would not write');

  await ctx.runNextStep(runner);

  const errored = await ctx.readKinds('task.step_errored');
  const committed = await ctx.readKinds('task.step_committed');

  expect(errored).toStrictEqual([]);
  expect(committed).toHaveLength(1);
});

test('it destroys the imps of closed tasks, and on a later pass the one whose destroy failed', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const stuck = await ctx.seedTask(starter);

  const other = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Ferry times',
    brief: 'Find the last ferry on Sunday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  ctx.guest.failNextDestroy(stuck, 'the imp would not stop');

  await writeTaskControl(ctx.context, { taskID: stuck, control: 'close' });
  await waitForCondition(() => ctx.events.includes('nixie_runner.task_remove_failed'));
  await writeTaskControl(ctx.context, { taskID: other, control: 'close' });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(stuck);

    return sandboxes.length === 0;
  });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(other);

    return sandboxes.length === 0;
  });

  expect(ctx.events.filter((event) => event.startsWith('nixie_runner.task_'))).toStrictEqual([
    'nixie_runner.task_remove_failed',
    'nixie_runner.task_removed',
    'nixie_runner.task_removed',
  ]);
});

test('it rebuilds the session of a task whose imp is gone with the messages the task sent', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Which quay?');

  const claim = await claimTask(ctx.context, { holder: 'test-runner', leaseMs: 60_000, taskID });

  invariant(claim);

  await writeTestTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: taskID,
      to: 'conversation',
      kind: 'report',
      body: 'High tide on Saturday is at 06:42 at Bramble Quay.',
      replyTo: null,
      onBehalfOf: [],
      wake: false,
    },
  );

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  const [lost] = await ctx.sandboxes.list(taskID);

  await lost?.destroy();
  await ctx.writeMessage(taskID, 'And the low tide?');
  await ctx.runNextStep(runner);

  const rebuilt = ctx.guest.turns.at(-1);
  const input = rebuilt?.input.map((message) => message.text).join('\n') ?? '';

  expect(rebuilt?.resume).toBeNull();
  expect(input).toInclude('High tide on Saturday is at 06:42 at Bramble Quay.');
});

test("it runs a task on its chosen model's profile, through that profile's host, with its own tool list", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  const taskID = await ctx.seedTask(starter, {
    model: 'second-look',
    profile: 'router-b',
    tools: ['tasks.list', 'task.message', 'web_fetch'],
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const [sandbox] = await ctx.sandboxes.list(taskID);

  const [turn] = ctx.guest.turns;

  expect(sandbox?.spec.grants).toStrictEqual([
    expect.objectContaining({
      host: 'router.example.test',
      env: { ANTHROPIC_AUTH_TOKEN: expect.toBeString() },
    }),
  ]);

  expect(turn?.profile).toStrictEqual({
    harness: 'agent-sdk',
    model: 'other-family-test-3',
    baseURL: 'https://router.example.test/anthropic',
    effort: 'low',
    contextTokens: null,
    cacheTTL: '5m',
    authHeader: 'bearer',
  });

  expect(ctx.runs).toStrictEqual([
    {
      toolUseMetaKey: 'claudecode/toolUseId',
      runID: taskID,
      thread: taskID,
      tools: ['tasks.list', 'task.message', 'web_fetch', 'turn.end_silently'],
      model: { model: 'other-family-test-3', profile: 'router-b' },
    },
  ]);
});

test('it gives a stranger no persona text and no memory item', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { model: 'second-look', profile: 'router-b', persona: 'none' });

  const memory = buildStubMemory({
    pinned: [
      {
        itemID: '7c1d1f0e-5b7a-4f43-9a1e-2f0c4b8d9e11',
        version: 1,
        shortID: 'm4k2p8w1qz',
        subject: 'owner',
        text: 'Keeps bees on the allotment',
        origin: 'owner',
        source: 'owner',
        model: null,
        recordedAt: Date.UTC(2026, 9, 1),
        evidenceQuote: null,
        approval: null,
      },
    ],
    pinnedUse: { items: 1, tokens: 8, budget: 2000 },
  });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;

  invariant(turn);

  const input = turn.input.map((message) => message.text).join('\n');

  expect(turn.systemPrompt).not.toInclude('You are Pip.');
  expect(input).not.toInclude('Keeps bees on the allotment');
  expect(input).not.toInclude('pinned-memory');
});

test('it gives another me the persona and the pinned memory', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { persona: 'default', memory: 'read' });

  const memory = buildStubMemory({
    pinned: [
      {
        itemID: '7c1d1f0e-5b7a-4f43-9a1e-2f0c4b8d9e11',
        version: 1,
        shortID: 'm4k2p8w1qz',
        subject: 'owner',
        text: 'Keeps bees on the allotment',
        origin: 'owner',
        source: 'owner',
        model: null,
        recordedAt: Date.UTC(2026, 9, 1),
        evidenceQuote: null,
        approval: null,
      },
    ],
    pinnedUse: { items: 1, tokens: 8, budget: 2000 },
  });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(turn?.systemPrompt).toInclude('You are Pip.');
  expect(input).toInclude('Keeps bees on the allotment');
});

test("it searches memory for the brief of a task that reads memory, on the task's first turn", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { persona: 'default', memory: 'read' });

  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);

  const queries = memory.recall.mock.calls.map(([request]) => request.query);

  expect(queries).toStrictEqual(['Find the high tides for Saturday.']);
});

test('it searches memory for the body of a task message to a task that reads memory', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter, { persona: 'default', memory: 'read' });

  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);
  await ctx.writeTaskMessage(taskID, 'Only the morning tide at the harbour.');
  await ctx.runNextStep(runner);

  const queries = memory.recall.mock.calls.map(([request]) => request.query);

  expect(queries.at(-1)).toBe('Only the morning tide at the harbour.');
});

test('it purges and invalidates the session of a task that reads memory on a forget, so its next turn opens a new one', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter, { persona: 'default', memory: 'read' });
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await runner.cleanupSessions({ itemID: 'item-bees' });
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  const invalidated = await ctx.readKinds('model.session_invalidated');

  const [, second] = ctx.guest.turns;

  expect(invalidated.map((record) => record.thread)).toStrictEqual([taskID]);
  expect(ctx.guest.purged).toHaveLength(1);
  expect(second?.resume).toBeNull();
});

test("it shreds the summary and removes the web fetch links of a task that reads memory on a forget, and keeps another thread's links", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter, { persona: 'default', memory: 'read' });
  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  await seedWebFetchLinks(ctx.context.log, {
    sessionKey: 'session-tides',
    thread: taskID,
    urls: ['https://harbour.test/tides'],
  });

  await seedWebFetchLinks(ctx.context.log, {
    sessionKey: 'session-ferry',
    thread: 'conversation',
    urls: ['https://harbour.test/ferry'],
  });

  await runner.cleanupSessions({ itemID: 'item-bees' });

  const summaries = await ctx.readKinds('model.session_summarized');

  const taskLink = await readLinkTarget(ctx.context.log, {
    sessionKey: 'session-tides',
    number: 1,
  });

  const otherLink = await readLinkTarget(ctx.context.log, {
    sessionKey: 'session-ferry',
    number: 1,
  });

  expect(summaries.map((record) => [record.thread, record.erasable.status])).toStrictEqual([
    [taskID, 'shredded'],
  ]);

  expect(taskLink).toBeNull();
  expect(otherLink).toBe('https://harbour.test/ferry');
});

test('it runs the brief of a task that reads memory when a forget comes before its first session', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { persona: 'default', memory: 'read' });

  const runner = await ctx.startRunner();

  await runner.cleanupSessions({ itemID: 'item-bees' });
  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(input).toInclude('Your task starts now');
});

test('it purges the guest of a task that reads memory when a forget aborts its first turn', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { persona: 'default', memory: 'read' });

  const runner = await ctx.startRunner();

  const held = Promise.withResolvers<void>();

  onTestFinished(() => {
    held.resolve();
  });

  ctx.guest.addKindReplies('worker', { text: 'Checking the tides.', gate: () => held.promise });

  const step = ctx.runNextStepWithNoRetryDelay(runner);

  await waitForCondition(() => ctx.guest.turns.length === 1);

  await runner.cleanupSessions({ itemID: 'item-bees' });

  await step;

  expect(ctx.guest.purged).toHaveLength(1);
});

test('it leaves the session of a task that reads no memory as it is on a forget', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { memory: 'none' });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await runner.cleanupSessions({ itemID: 'item-bees' });

  const invalidated = await ctx.readKinds('model.session_invalidated');

  expect(invalidated).toStrictEqual([]);
  expect(ctx.guest.purged).toStrictEqual([]);
});

test('it pauses a task at its turn limit with no turn, and tells its starter in a limit notice', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter, { limits: { turns: 1, dollars: 2 } });
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  const paused = await ctx.readKinds('task.paused');
  const notices = await ctx.readKinds('task.limit_notice');

  expect(ctx.guest.turns).toHaveLength(1);
  expect(paused.map((record) => record.thread)).toStrictEqual([taskID]);

  expect(
    notices.map((record) => ({ thread: record.thread, payload: record.payload })),
  ).toStrictEqual([
    {
      thread: 'conversation',
      payload: { taskID, used: { turns: 1, dollars: 0 }, limits: { turns: 1, dollars: 2 } },
    },
  ]);
});

test('it sleeps the awake imp of a task that pauses at its limit after a turn with work left', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { limits: { turns: 1, dollars: 2 } });

  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const slept = await ctx.readKinds('sandbox.slept');

  expect(ctx.guest.turns).toHaveLength(1);
  expect(slept).toHaveLength(1);
});

test("it pauses a task at its dollar limit, priced on its model's profile", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  const taskID = await ctx.seedTask(starter, {
    model: 'second-look',
    profile: 'router-b',
    limits: { turns: 25, dollars: 1e-6 },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  const [notice] = await ctx.readKinds('task.limit_notice');

  expect(ctx.guest.turns).toHaveLength(1);

  expect(notice?.payload).toStrictEqual({
    taskID,
    used: { turns: 1, dollars: expect.toBePositive() },
    limits: { turns: 25, dollars: 1e-6 },
  });
});

test('it interrupts a task turn whose model calls reach its dollar limit, and pauses the task with the limit it reached', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  const taskID = await ctx.seedTask(starter, {
    model: 'second-look',
    profile: 'router-b',
    limits: { turns: 25, dollars: 0.03 },
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    usage: {
      uncachedInputTokens: 10_000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
    gate: () =>
      waitForCondition(() => ctx.guest.received.some((entry) => entry.frame.type === 'interrupt')),
  });

  await ctx.runNextStep(runner);

  const paused = await ctx.readKinds('task.paused');
  const [notice] = await ctx.readKinds('task.limit_notice');

  expect(paused.map((record) => record.thread)).toStrictEqual([taskID]);

  expect(notice?.payload).toStrictEqual({
    taskID,
    used: { turns: 1, dollars: 0.03 },
    limits: { turns: 25, dollars: 0.03 },
  });
});

test('it interrupts a task turn on the call that reaches its dollar limit with the spend of its earlier turns', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  const taskID = await ctx.seedTask(starter, {
    model: 'second-look',
    profile: 'router-b',
    limits: { turns: 25, dollars: 0.03 },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the evening tide.',
    usage: {
      uncachedInputTokens: 9990,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
    gate: () =>
      waitForCondition(() => ctx.guest.received.some((entry) => entry.frame.type === 'interrupt')),
  });

  await ctx.writeMessage(taskID, 'And the evening tide?');
  await ctx.runNextStep(runner);

  const [notice] = await ctx.readKinds('task.limit_notice');

  expect(notice?.payload).toStrictEqual({
    taskID,
    used: { turns: 2, dollars: expect.toBeWithin(0.03, 0.031) },
    limits: { turns: 25, dollars: 0.03 },
  });
});

test('it pauses a task whose guest fails after its calls reach the dollar limit, so no retry spends again', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  const taskID = await ctx.seedTask(starter, {
    model: 'second-look',
    profile: 'router-b',
    limits: { turns: 25, dollars: 0.03 },
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    failure: 'the guest lost its model stream',
    usage: {
      uncachedInputTokens: 10_000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
  });

  await ctx.runNextStep(runner);

  const paused = await ctx.readKinds('task.paused');
  const [notice] = await ctx.readKinds('task.limit_notice');
  const errored = await ctx.readKinds('task.step_errored');

  expect(paused.map((record) => record.thread)).toStrictEqual([taskID]);

  expect(notice?.payload).toStrictEqual({
    taskID,
    used: { turns: 0, dollars: 0.03 },
    limits: { turns: 25, dollars: 0.03 },
  });

  expect(errored.map((record) => record.thread)).toStrictEqual([taskID]);
});

test("it gives the retry of a failed turn only the dollars that the turn's spend and a raise leave", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  const taskID = await ctx.seedTask(starter, {
    model: 'second-look',
    profile: 'router-b',
    limits: { turns: 25, dollars: 0.03 },
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies(
    'worker',
    {
      failure: 'the guest lost its model stream',
      usage: {
        uncachedInputTokens: 10_000,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
    },
    {
      text: 'Checking the tides.',
      usage: {
        uncachedInputTokens: 4000,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
    },
  );

  await ctx.runNextStepWithNoRetryDelay(runner);

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 0.04 } });

  await ctx.runNextStep(runner);

  const notices = await ctx.readKinds('task.limit_notice');

  const [failed, retried] = notices.map(
    (notice) => taskLimitNoticeCodec.decode(notice.payload).used,
  );

  expect(failed).toStrictEqual({ turns: 0, dollars: 0.03 });
  expect(retried?.turns).toBe(1);
  expect(retried?.dollars).toBeCloseTo(0.042, 6);
});

test('it caps each task turn at 100 model calls', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter);

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.guest.turns[0]?.limits).toStrictEqual({ modelCalls: 100 });
});

test('it sleeps the imp of a task whose turn reached its dollar limit with work left', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, {
    model: 'second-look',
    profile: 'router-b',
    limits: { turns: 25, dollars: 0.03 },
  });

  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    usage: {
      uncachedInputTokens: 10_000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
  });

  await ctx.runNextStep(runner);

  const slept = await ctx.readKinds('sandbox.slept');

  expect(slept).toHaveLength(1);
});

test('it runs the next turn of a task paused at its turn limit once the limit is raised', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter, { limits: { turns: 1, dollars: 2 } });
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 2 } });

  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(ctx.guest.turns).toHaveLength(2);
  expect(input).toInclude('Only the morning tide, please.');
});
