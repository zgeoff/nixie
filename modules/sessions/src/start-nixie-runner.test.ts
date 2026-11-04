import { expect, test } from 'bun:test';
import { modelsConfigSchema } from '@heynixie/models';
import {
  claimTask,
  runTaskStep,
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
import { buildStubToolEndpoint } from './test-utils/build-stub-tool-endpoint';
import { readRecordsByKind } from './test-utils/read-records-by-kind';
import { runNextStep } from './test-utils/run-next-step';
import { startTestSessionHost } from './test-utils/start-test-session-host';

async function setupTest() {
  const host = await startTestSessionHost();

  const tools = buildStubToolEndpoint();
  const events: string[] = [];

  const startRunner = async (parts: Partial<Pick<NixieRunnerOptions, 'tools'>> = {}) => {
    const runner = await startNixieRunner({
      context: host.context,
      models: modelsConfigSchema.parse({
        profiles: {
          'chat-direct': {
            base_url: 'https://models.example.test',
            credential: 'deployment:anthropic',
            auth_header: 'x-api-key',
            model: 'claude-test-1',
            effort: 'low',
          },
          errands: {
            base_url: 'https://models.example.test',
            credential: 'deployment:anthropic',
            auth_header: 'x-api-key',
            model: 'claude-test-errands',
            effort: 'low',
            context_tokens: 200_000,
          },
          'router-b': {
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
      image: 'nixie-conversation-0123456789ab',
      tools: parts.tools ?? tools.endpoint,
      memory: () => ({
        readPinnedCore: () =>
          Promise.resolve([
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
          ]),
        readPinnedCoreUse: () => Promise.resolve({ items: 1, tokens: 8, budget: 2000 }),
        recall: () => Promise.resolve({ items: [] }),
        recallMessages: () => Promise.resolve({ messages: [] }),
        readShortIDs: () => Promise.resolve(new Map()),
      }),
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

test("it runs a started task's tool run on its own ID with the tools it is given and the task role's model", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();
  const taskID = await ctx.seedTask(starter);
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs).toStrictEqual([
    {
      runID: taskID,
      thread: taskID,
      tools: ['tasks.list', 'task.message', 'time.now'],
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

  expect(turn?.profile).toMatchObject({
    model: 'other-family-test-3',
    baseURL: 'https://router.example.test/anthropic',
    authHeader: 'bearer',
  });

  expect(ctx.runs).toStrictEqual([
    {
      runID: taskID,
      thread: taskID,
      tools: ['tasks.list', 'task.message', 'web_fetch'],
      model: { model: 'other-family-test-3', profile: 'router-b' },
    },
  ]);
});

test('it gives a stranger no persona text and no memory item', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { model: 'second-look', profile: 'router-b', persona: 'none' });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(turn?.systemPrompt).not.toInclude('You are Pip.');
  expect(input).not.toInclude('Keeps bees on the allotment');
  expect(input).not.toInclude('pinned-memory');
});

test('it gives another me the persona and the pinned memory', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seedConversationStep();

  await ctx.seedTask(starter, { persona: 'default', memory: 'read' });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(turn?.systemPrompt).toInclude('You are Pip.');
  expect(input).toInclude('Keeps bees on the allotment');
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

  expect(notices).toMatchObject([
    {
      thread: 'conversation',
      payload: { taskID, used: { turns: 1, dollars: 0 }, limits: { turns: 1, dollars: 2 } },
    },
  ]);
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
  expect(notice?.payload).toMatchObject({ used: { turns: 1, dollars: expect.toBePositive() } });
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
