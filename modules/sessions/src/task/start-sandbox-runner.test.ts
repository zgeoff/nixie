import { expect, mock, onTestFinished, test } from 'bun:test';
import { readLinkTarget } from '@heynixie/connectors';
import type { Definitions, RecordInput } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { modelsConfigSchema } from '@heynixie/models';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import {
  claimTask,
  createConversationTask,
  readOpenRun,
  runTaskStep,
  taskLimitNoticeCodec,
  writeFailedTurnSpend,
  writeInboxRecords,
  writeStepCommit,
  writeTaskControl,
  writeTaskLimitRaise,
} from '@heynixie/tasks';
import {
  readTestTaskProgress,
  seedDefinitionTask,
  writeTestTaskMessage,
  writeTestTriggerFire,
} from '@heynixie/tasks/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { buildStubMemory } from '../test-utils/build-stub-memory';
import { buildStubToolEndpoint } from '../test-utils/build-stub-tool-endpoint';
import { readRecordsByKind } from '../test-utils/read-records-by-kind';
import { runNextStep } from '../test-utils/run-next-step';
import { startTestSessionHost } from '../test-utils/start-test-session-host';
import type { InStepActions } from '../types';
import type { StepCaptureInput } from '../utils/open-step-capture';
import { workerRunStartedCodec } from '../worker/worker-run-started-codec';
import { workerTurnEndedCodec } from '../worker/worker-turn-ended-codec';
import { buildRunSettings } from './build-run-settings';
import { readRunUsage } from './read-run-usage';
import type { SandboxRunnerOptions } from './sandbox-runner-options';
import { startSandboxRunner } from './start-sandbox-runner';

async function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const models = modelsConfigSchema.parse({
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
        outside_claude: false,
        effort: 'low',
        prices: { input: 3, cache_write: 3, cache_write_1h: 3, cached_input: 0.3, output: 15 },
      },
    },
    roles: { conversation: 'chat-direct', task: 'errands' },
    selectable: {
      'second-look': { profile: 'router-b', description: 'Another family' },
    },
  });

  const secrets = {
    model_credentials: { anthropic: 'not-a-real-key', router: 'not-a-real-token' },
  };

  const host = await startTestSessionHost({
    clock,
    runSettings: buildRunSettings({ models, secrets, hopLimit: 20 }),
  });

  const tools = buildStubToolEndpoint();
  const events: string[] = [];
  const clearFetchPauses = mock<() => void>();

  const noMemory = buildStubMemory({
    pinned: [],
    pinnedUse: { items: 0, tokens: 0, budget: 2000 },
  });

  const startRunner = async (
    parts: Partial<
      Pick<SandboxRunnerOptions, 'tools' | 'memory' | 'gateway' | 'turnInputs' | 'inStepActions'>
    > = {},
  ) => {
    const runner = await startSandboxRunner({
      context: host.context,
      models,
      secrets,
      sandboxes: host.sandboxes,
      images: { conversation: 'nixie-conversation-0123456789ab' },
      tools: parts.tools ?? tools.endpoint,
      memory: parts.memory ?? (() => noMemory),
      ...(parts.gateway === undefined ? {} : { gateway: parts.gateway }),
      ...(parts.turnInputs === undefined ? {} : { turnInputs: parts.turnInputs }),
      getDefinitions: () => ({
        persona: 'You are Pip.',
        prompts: {},
        personaHash: 'sha256:persona-test',
        policyHash: 'sha256:policy-test',
      }),
      memorySettings: {
        rebuildTokens: 30_000,
        ownerName: 'Robin',
        agentNames: [],
      },
      memoryReadTools: ['memory.recall', 'moment.find'],
      compaction: { threshold: 0.8, headsUp: 0.7, summaryTokens: 2000 },
      defaultZone: 'UTC',
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: 'Robin', agentName: null },
      clearFetchPauses,
      log: (event) => {
        events.push(event);
      },
      ...(parts.inStepActions === undefined ? {} : { inStepActions: parts.inStepActions }),
    });

    host.defer(() => runner.stop());

    return runner;
  };

  return {
    ...host,
    clock,
    runs: tools.runs,
    steps: tools.steps,
    events,
    clearFetchPauses,
    startRunner,
    seed: buildSeeder(host),
    writeDefinitionTask: (seed: Parameters<typeof seedDefinitionTask>[1]) =>
      seedDefinitionTask({ ...host, writer: host.context.log.writer }, seed),
    writeFire: (taskID: string, definitionHash: string, dedupeKey: string) =>
      writeTestTriggerFire(host.context, taskID, { definitionHash, dedupeKey }),
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
        logger: () => {},
        maxStepErrors: 3,
        retryDelayMs: 0,
        maxRetryDelayMs: 0,
      });
    },
    readKinds: (kind: string) => readRecordsByKind(host.context.log, kind),
    readBriefIDs: async (): Promise<string[]> => {
      const records = await readRecordsByKind(host.context.log, 'task.run_opened');

      return records.map((record) => {
        const briefID = record.payload['briefID'];

        invariant(typeof briefID === 'string', 'a task run opens with a brief ID');

        return briefID;
      });
    },
    writeLegacyOpening: (taskID: string) =>
      writeRecords(host.context.log, [
        {
          kind: 'model.session_opened',
          definitions: host.context.definitions(),
          thread: taskID,
          payload: {},
        },
      ]),
  };
}

test.each([
  {
    name: 'a task report',
    buildRecord: (taskID: string, definitions: Definitions): RecordInput => ({
      kind: 'task_message',
      definitions,
      thread: taskID,
      payload: {
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
      },
      erasable: { body: 'The ferry runs at 09:25.' },
    }),
  },
  {
    name: 'a timer',
    buildRecord: (taskID: string, definitions: Definitions): RecordInput => ({
      kind: 'timer.fired',
      definitions,
      thread: taskID,
      payload: { timerID: 'tide-check', taskID, dueAt: 1000, firedAt: 1000 },
    }),
  },
])(
  'it ends a task turn that $name alone woke with no task message, keeps the text written before, and records the turn end as silent',
  async (row) => {
    const ctx = await setupTest();
    const starter = await ctx.seed.conversationStep();

    const taskID = await ctx.seed.task({
      starter: starter.claim,
      name: 'Tide tables',
      brief: 'Find the high tides for Saturday.',
    });

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

    await writeInboxRecords(ctx.context, [row.buildRecord(taskID, ctx.context.definitions())]);

    await ctx.runNextStep(runner);

    const replies = await ctx.readKinds('model.reply');
    const sent = await ctx.readKinds('task_message');
    const ended = await ctx.readKinds('model.turn_ended');

    expect(ends).toStrictEqual(['ended']);

    expect(replies.slice(repliesBefore.length).map((record) => record.erasable)).toStrictEqual([
      { status: 'readable', fields: { text: 'Nothing new on the tides.' } },
    ]);

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
        outcome: 'finished',
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
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

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
      runID: expect.any(String),
    },
    erasable: { status: 'readable', fields: { text: 'The morning tide is at 06:10.' } },
  });
});

test("it keeps a task's plain text on its own thread, with no message to its starter and no channel", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.addReplies({ text: 'The morning tide is at 06:10.' });

  await ctx.runNextStep(runner);

  const replies = await ctx.readKinds('model.reply');
  const messages = await ctx.readKinds('task_message');

  expect(replies.map((record) => [record.thread, record.erasable.status])).toStrictEqual([
    [taskID, 'readable'],
  ]);

  expect(messages.map((record) => record.payload['kind'])).toStrictEqual(['request']);
});

test("it runs a started task's first step in a worker imp that the task owns", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

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
      limits: { vcpus: 1, memoryMiB: 384, diskMiB: 4096 },
    },
  ]);
});

test("it runs a started task's tool run on its own ID with the tools it is given, the silent end and the task role's model", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs).toStrictEqual([
    {
      toolUseMetaKey: 'claudecode/toolUseId',
      runID: taskID,
      thread: taskID,
      logThread: taskID,
      tools: ['tasks.list', 'task.message', 'task.report', 'time.now', 'turn.end_silently'],
      model: { model: 'claude-test-errands', profile: 'errands' },
    },
  ]);
});

test("it runs a started task with the conversation's log on the conversation's log thread, and its own thread", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Note taker',
    brief: 'Save what is worth keeping.',
    options: { log: 'conversation' },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs).toStrictEqual([
    expect.objectContaining({ runID: taskID, thread: taskID, logThread: 'conversation' }),
  ]);
});

test("it opens a started task's first session under the task prompt, with its brief as the first message in the envelope and no start note, persona or memory", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(turn?.profile.model).toBe('claude-test-errands');
  expect(turn?.systemPrompt).toStartWith('You are "Tide tables", a task working for Robin.');
  expect(turn?.systemPrompt).not.toInclude('You are Pip.');

  expect(input).toMatch(
    /<task-message id="\w+" from="task: conversation" kind="request" sent="[^"]+" fence="(?<fence>\w+)">\nFind the high tides for Saturday\.\n<\/task-message fence="\k<fence>">$/u,
  );

  expect(input).not.toInclude('task-start');
  expect(input).not.toInclude('pinned-memory');
  expect(ctx.guest.received.map((received) => received.owner)).toStrictEqual([taskID]);
});

test('it gives a task started with the persona and no memory no memory block, and a message that waits behind its brief the next turn, with no new wake', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'none' },
  });

  await ctx.writeMessage(taskID, 'Only the morning tide, please.');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const [first, second] = ctx.guest.turns;
  const firstInput = first?.input.map((message) => message.text).join('\n') ?? '';
  const secondInput = second?.input.map((message) => message.text).join('\n') ?? '';

  expect(firstInput).not.toInclude('pinned-memory');
  expect(firstInput).toInclude('Find the high tides for Saturday.');
  expect(firstInput).not.toInclude('Only the morning tide, please.');
  expect(secondInput).toInclude('Only the morning tide, please.');
  expect(secondInput).not.toInclude('Find the high tides for Saturday.');
});

test("it rebuilds a started task's session once, with its brief in the new session, when the newest opening carries no brief mark", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeLegacyOpening(taskID);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'And the evening one.');
  await ctx.runNextStep(runner);

  const [, rebuilt, resumed] = ctx.guest.turns;
  const rebuiltInput = rebuilt?.input.map((message) => message.text).join('\n') ?? '';

  expect(rebuilt?.resume).toBeNull();
  expect(rebuiltInput.split('Find the high tides for Saturday.')).toHaveLength(2);
  expect(rebuiltInput).toInclude('Only the morning tide, please.');
  expect(resumed?.resume?.sessionID).toBeString();
});

test('it sleeps the imp of a step that waits, and wakes the same imp for the next message', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

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
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

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

  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner({ tools: failing.endpoint });

  await ctx.runNextStepWithNoRetryDelay(runner);
  await ctx.runNextStep(runner);

  expect(ctx.guest.turns).toHaveLength(1);
});

test('it destroys the imp of an idle task when the task closes, with no further step', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  await writeTaskControl(ctx.context, { taskID, control: 'close' });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(taskID);

    return sandboxes.length === 0;
  });

  expect(ctx.guest.turns).toHaveLength(1);
});

test("it compacts a started task's session under the task prompt, with its name and no persona", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const prompts = ctx.guest.summaries.map((summary) => summary.systemPrompt);

  expect(prompts).toStrictEqual([
    expect.stringContaining('You are "Tide tables", a task working for'),
  ]);

  expect(prompts.join('')).not.toInclude('You are Pip.');
});

test('it commits a step whose imp fails to sleep, with no step error', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

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
  const starter = await ctx.seed.conversationStep();

  const stuck = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const other = await ctx.seed.task({
    starter: starter.claim,
    name: 'Ferry times',
    brief: 'Find the last ferry on Sunday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  ctx.guest.failNextDestroy(stuck, 'the imp would not stop');

  await writeTaskControl(ctx.context, { taskID: stuck, control: 'close' });
  await waitForCondition(() => ctx.events.includes('sandbox_runner.remove_failed'));
  await writeTaskControl(ctx.context, { taskID: other, control: 'close' });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(stuck);

    return sandboxes.length === 0;
  });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(other);

    return sandboxes.length === 0;
  });

  expect(ctx.events.filter((event) => event.startsWith('sandbox_runner.'))).toStrictEqual([
    'sandbox_runner.remove_failed',
    'sandbox_runner.task_removed',
    'sandbox_runner.task_removed',
  ]);
});

test('it destroys the imp of a disposable task once it reports, and leaves the imp of a kept task asleep', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const disposableID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    disposable: true,
  });

  const keptID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Ferry times',
    brief: 'Find the last ferry on Sunday.',
    disposable: false,
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const asleep = await ctx.sandboxes.list(disposableID);

  for (const taskID of [disposableID, keptID]) {
    const [message] = await ctx.writeMessage(taskID, 'Send me what you have.');
    const claim = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000, taskID });

    invariant(claim && message, 'the woken task has a message to read and a claim');

    await writeStepCommit(ctx.context, claim, {
      next: 'done',
      records: [],
      acknowledged: [message.sequence],
      run: { activity: 'worked', report: { summary: 'High tide is at 06:42.' } },
    });
  }

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(disposableID);

    return sandboxes.length === 0;
  });

  const kept = await ctx.sandboxes.list(keptID);
  const closed = await ctx.readKinds('task.closed');

  expect(asleep).toHaveLength(1);
  expect(kept).toHaveLength(1);
  expect(closed.map((record) => record.thread)).toStrictEqual([disposableID]);
});

test('it logs a destroy that fails, leaves the close committed, and destroys the imp on the next pass', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  ctx.guest.failNextDestroy(taskID, 'the imp would not stop');

  await writeTaskControl(ctx.context, { taskID, control: 'close' });
  await waitForCondition(() => ctx.events.includes('sandbox_runner.remove_failed'));

  const closed = await ctx.readKinds('task.closed');

  ctx.clock.advance(60_000);

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(taskID);

    return sandboxes.length === 0;
  });

  expect(ctx.events).toContain('sandbox.remove_failed');
  expect(closed).toHaveLength(1);
});

test('it rebuilds the session of a task whose imp is gone with the messages the task sent', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Which quay?');

  const claim = await claimTask(ctx.context, { holder: 'test-runner', leaseMs: 60_000, taskID });

  invariant(claim);

  await writeTestTaskMessage(
    ctx.context,
    {
      directory: [
        {
          taskID: 'conversation',
          name: 'Conversation',
          brief: 'Talks.',
          wakeable: true,
          speaker: 'conversation',
        },
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
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      tools: ['tasks.list', 'task.message', 'web_fetch'],
    },
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
    requestRewrite: null,
    authHeader: 'bearer',
  });

  expect(ctx.runs).toStrictEqual([
    {
      toolUseMetaKey: 'claudecode/toolUseId',
      runID: taskID,
      thread: taskID,
      logThread: taskID,
      tools: ['tasks.list', 'task.message', 'web_fetch', 'turn.end_silently', 'task.report'],
      model: { model: 'other-family-test-3', profile: 'router-b' },
    },
  ]);
});

test("it sends a task turn to its profile's base URL with the sandbox name and the profile ID when the gateway counts", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { model: 'second-look', profile: 'router-b', tools: ['tasks.list'] },
  });

  const runner = await ctx.startRunner({ gateway: buildStubSpendGateway() });

  await ctx.runNextStep(runner);

  const [sandbox] = await ctx.sandboxes.list(taskID);

  const [turn] = ctx.guest.turns;

  expect(turn?.profile.baseURL).toBe(
    `https://router.example.test/anthropic/${sandbox?.id ?? ''}/router-b`,
  );
});

test('it opens the capture of a task step on the routed base URL, so the tag follows the profile ID', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { model: 'second-look', profile: 'router-b', tools: ['tasks.list'] },
  });

  const openCapture = mock((input: StepCaptureInput) =>
    Promise.resolve({
      baseURL: `${input.profile.baseURL}/~in.tag`,
      close: () => Promise.resolve(),
    }),
  );

  const runner = await ctx.startRunner({
    gateway: buildStubSpendGateway(),
    turnInputs: { openCapture },
  });

  await ctx.runNextStep(runner);

  const [sandbox] = await ctx.sandboxes.list(taskID);

  const [turn] = ctx.guest.turns;

  expect(turn?.profile.baseURL).toBe(
    `https://router.example.test/anthropic/${sandbox?.id ?? ''}/router-b/~in.tag`,
  );
});

test('it gives a stranger no persona text and no memory item', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { model: 'second-look', profile: 'router-b', persona: 'none' },
  });

  const memory = buildStubMemory({
    pinned: [
      {
        itemID: '7c1d1f0e-5b7a-4f43-9a1e-2f0c4b8d9e11',
        version: 1,
        revision: 1,
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
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

  const memory = buildStubMemory({
    pinned: [
      {
        itemID: '7c1d1f0e-5b7a-4f43-9a1e-2f0c4b8d9e11',
        version: 1,
        revision: 1,
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

test('it places the memory index after the pinned memory in the opening of a task that reads memory', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

  const memory = buildStubMemory({
    pinned: [],
    pinnedUse: { items: 0, tokens: 0, budget: 2000 },
    index: {
      text: 'Your memory index.\nAbout Robin:\n  boats (1)  [q8w2e4r6ty] canoe stored at the lake',
      items: 1,
      tokens: 30,
      budget: 3000,
    },
  });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(
    [...input.matchAll(/<system-message type="(?<type>[a-z-]+)"/gu)].map(
      (match) => match.groups?.['type'],
    ),
  ).toStrictEqual(['status', 'pinned-memory', 'memory-index']);

  expect(input).toInclude('canoe stored at the lake');
  expect(memory.readIndex).toHaveBeenCalledOnce();
});

test('it calls no memory index read for a task with no memory', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'none' },
  });

  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);

  expect(memory.readIndex).not.toHaveBeenCalled();
});

test("it searches memory for the brief of a task that reads memory, on the task's first turn", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);

  const queries = memory.readTurnMemory.mock.calls.map(([ask]) => ask.text);

  expect(queries).toStrictEqual(['Find the high tides for Saturday.']);
});

test('it searches memory for the body of a task message to a task that reads memory', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const runner = await ctx.startRunner({ memory: () => memory });

  await ctx.runNextStep(runner);
  await ctx.writeTaskMessage(taskID, 'Only the morning tide at the harbour.');
  await ctx.runNextStep(runner);

  const queries = memory.readTurnMemory.mock.calls.map(([ask]) => ask.text);

  expect(queries.at(-1)).toBe('Only the morning tide at the harbour.');
});

test('it clears every web fetch pause on a forget', async () => {
  const ctx = await setupTest();
  const runner = await ctx.startRunner();

  await runner.cleanupSessions({ itemID: 'item-bees' });

  expect(ctx.clearFetchPauses).toHaveBeenCalledOnce();
});

test('it clears every web fetch pause only after an in-flight turn of a task has ended on a forget', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

  const runner = await ctx.startRunner();

  const held = Promise.withResolvers<void>();

  onTestFinished(() => {
    held.resolve();
  });

  ctx.guest.addKindReplies('worker', { text: 'Checking the tides.', gate: () => held.promise });

  const step = ctx.runNextStepWithNoRetryDelay(runner);

  await waitForCondition(() => ctx.guest.turns.length === 1);

  const clearedDuringTurn: boolean[] = [];
  let hasStepEnded = false;

  ctx.clearFetchPauses.mockImplementation(() => {
    clearedDuringTurn.push(!hasStepEnded);
  });

  const cleanup = runner.cleanupSessions({ itemID: 'item-bees' });

  const watch = (async () => {
    await step;

    hasStepEnded = true;
  })();

  await cleanup;
  await watch;

  expect(clearedDuringTurn).toStrictEqual([false]);
});

test('it purges and invalidates the session of a task that reads memory on a forget, so its next turn opens a new one', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

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
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  await ctx.seed.webFetchLinks({
    sessionKey: 'session-tides',
    thread: taskID,
    urls: ['https://harbour.test/tides'],
  });

  await ctx.seed.webFetchLinks({
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
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

  const runner = await ctx.startRunner();

  await runner.cleanupSessions({ itemID: 'item-bees' });
  await ctx.runNextStep(runner);

  const [turn] = ctx.guest.turns;
  const input = turn?.input.map((message) => message.text).join('\n') ?? '';

  expect(input).toInclude('Find the high tides for Saturday.');
});

test('it purges the guest of a task that reads memory when a forget aborts its first turn', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { persona: 'default', memory: 'read' },
  });

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
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { memory: 'none' },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await runner.cleanupSessions({ itemID: 'item-bees' });

  const invalidated = await ctx.readKinds('model.session_invalidated');

  expect(invalidated).toStrictEqual([]);
  expect(ctx.guest.purged).toStrictEqual([]);
});

test('it purges and invalidates the session of a task that reads no memory when a forgotten record is on its thread', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { memory: 'none' },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const replies = await ctx.readKinds('model.reply');

  const recordSequence = replies.find((record) => record.thread === taskID)?.sequence ?? 0;

  await runner.cleanupSessions({ recordSequence });
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  const invalidated = await ctx.readKinds('model.session_invalidated');
  const completed = await ctx.readKinds('model.session_cleanup_completed');

  const [, second] = ctx.guest.turns;

  expect(recordSequence).toBeGreaterThan(0);

  expect(invalidated.map((record) => [record.thread, record.payload])).toStrictEqual([
    [taskID, { recordSequence }],
  ]);

  expect(completed.map((record) => [record.thread, record.payload])).toStrictEqual([
    [taskID, { recordSequence }],
  ]);

  expect(ctx.guest.purged).toHaveLength(1);
  expect(second?.resume).toBeNull();
});

test('it leaves a closed task with no sandbox and no invalidation when a forgotten record is on its thread', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { memory: 'none' },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const replies = await ctx.readKinds('model.reply');

  const recordSequence = replies.find((record) => record.thread === taskID)?.sequence ?? 0;

  await writeTaskControl(ctx.context, { taskID, control: 'close' });

  await runner.cleanupSessions({ recordSequence });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(taskID);

    return sandboxes.length === 0;
  });

  const invalidated = await ctx.readKinds('model.session_invalidated');

  expect(invalidated).toStrictEqual([]);
});

test('it pauses a task at its turn limit with no turn, and tells its starter in a limit notice', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { report: 'none', limits: { turns: 1, dollars: 2 } },
  });

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

test('it voids the replies a dead attempt left, and runs no turn, when a step reruns after its report was asked for', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { report: 'none' },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const [opened] = await ctx.readKinds('task.run_opened');

  invariant(opened);

  const runID = opened.payload['runID'];

  invariant(typeof runID === 'string', 'a task run opens with a run ID');

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.run_report_requested',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: {
        taskID,
        runID,
        stepKey: `${taskID}:2`,
        reportID: 'rep0000001',
      },
      erasable: { summary: 'Done.' },
    },
    {
      kind: 'model.reply',
      definitions: ctx.context.definitions(),
      thread: taskID,
      payload: {
        model: 'claude-test-errands',
        profile: 'errands',
        messageID: 'msg_lost',
        runID: `${taskID}:2@1`,
      },
      erasable: { text: 'Lost.' },
    },
  ]);

  await ctx.writeMessage(taskID, 'Only the morning tide, please.');

  const turnsBefore = ctx.guest.turns.length;

  await ctx.runNextStep(runner);

  const [replies, voids] = await Promise.all([
    ctx.readKinds('model.reply'),
    ctx.readKinds('model.reply_voided'),
  ]);

  const lost = replies.find(
    (reply) => reply.erasable.status === 'readable' && reply.erasable.fields['text'] === 'Lost.',
  );

  invariant(lost);

  expect(ctx.guest.turns).toHaveLength(turnsBefore);

  expect(voids.map((record) => record.payload)).toStrictEqual([
    { replySequence: lost.sequence, runID: `${taskID}:2@1`, reason: 'attempt_lost' },
  ]);
});

test('it sleeps the awake imp of a task that pauses at its limit after a turn with work left', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { limits: { turns: 1, dollars: 2 } },
  });

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
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 1e-6 },
    },
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
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.03 },
    },
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

test('it resumes the work of a task turn that its dollar limit cut short once the limit is raised, with no new message', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      limits: { turns: 25, dollars: 0.03 },
    },
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
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

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 1 } });

  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(ctx.guest.turns).toHaveLength(2);
  expect(input).toInclude('Continue the work that is not done yet.');
});

test('it continues the work of a task turn that the user interrupted and paused once the user resumes it, with no new message', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      await writeTaskControl(ctx.context, { taskID, control: 'pause' });
      await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.runNextStep(runner);

  await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(ctx.guest.turns).toHaveLength(2);
  expect(input).toInclude('Continue the work that is not done yet.');
});

test('it runs on at once the work of a task turn that the user interrupted with no pause', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(ctx.guest.turns).toHaveLength(2);
  expect(input).toInclude('Continue the work that is not done yet.');
});

test('it runs a call approved while a task turn ran, in the step that continues the turn the user interrupted, and that turn reads its result', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const approval = { isPending: false, runs: 0 };

  const inStepActions: InStepActions = {
    replies: new Map(),
    probePending: () => Promise.resolve(approval.isPending),
    run: async (request) => {
      if (!approval.isPending) {
        return [];
      }

      approval.isPending = false;
      approval.runs += 1;

      await request.runCall({
        actionID: 'action-1',
        tool: 'memory.export',
        input: {},
        callSequence: 1,
        actionHash: 'sha256:any',
      });

      const [result] = await writeRecords(ctx.context.log, [
        {
          kind: 'tool_result',
          definitions: ctx.context.definitions(),
          thread: taskID,
          payload: {
            callID: 'call-1',
            runID: taskID,
            toolUseID: null,
            outcome: 'result',
            actionID: 'action-1',
            sources: { text: 'owner_data' },
          },
          erasable: { result: { text: 'the high tide is at 06:12' } },
          contentSource: 'owner_data',
        },
      ]);

      const [outcome] = await writeInboxRecords(ctx.context, [
        {
          kind: 'action.outcome',
          definitions: ctx.context.definitions(),
          thread: taskID,
          payload: {
            actionID: 'action-1',
            status: 'done',
            attempt: 1,
            reason: null,
            resultSequence: result?.sequence ?? 0,
          },
          erasable: {},
        },
      ]);

      return [
        {
          outcomeSequence: outcome?.sequence ?? 0,
          reply: { result: { text: 'the high tide is at 06:12' }, images: [] },
        },
      ];
    },
  };

  const tools = buildStubToolEndpoint({
    runApproved: () =>
      Promise.resolve({ status: 'done', resultSequence: 0, result: {}, images: [] }),
  });

  const runner = await ctx.startRunner({ tools: tools.endpoint, inStepActions });

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      approval.isPending = true;

      await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(ctx.guest.turns).toHaveLength(2);
  expect(approval.runs).toBe(1);
  expect(input).toInclude('the high tide is at 06:12');
});

test('it keeps awake the imp of a task whose turn the user interrupted with no pause', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.runNextStep(runner);

  const slept = await ctx.readKinds('sandbox.slept');

  expect(slept).toStrictEqual([]);
});

test('it sleeps the imp of a task whose turn the user interrupted and paused', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      await writeTaskControl(ctx.context, { taskID, control: 'pause' });
      await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.runNextStep(runner);

  const slept = await ctx.readKinds('sandbox.slept');

  expect(slept).toHaveLength(1);
});

test('it starts the next turn of an interrupted task from a message that arrived before the resume, with no continue note', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      await writeTaskControl(ctx.context, { taskID, control: 'pause' });
      await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Skip Saturday, check Sunday instead.');

  await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(input).toSatisfy(
    (text: string) =>
      text.includes('Skip Saturday, check Sunday instead.') &&
      !text.includes('Continue the work that is not done yet.'),
  );
});

test('it leaves waiting after its compaction a task whose turn ended before end_turn with no interrupt', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);
  ctx.guest.addKindReplies('worker', { text: 'Checking the tides.', stopReason: 'tool_use' });

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  expect(ctx.runNextStep(runner)).rejects.toThrow('no task had work to claim');
});

test('it continues the cut work of a task whose interrupted turn passed the compaction threshold, in the session after the summary', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.setContextSize(165_000);

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      await writeTaskControl(ctx.context, { taskID, control: 'pause' });
      await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.runNextStep(runner);

  await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(ctx.guest.summaries).toHaveLength(1);
  expect(ctx.guest.turns).toHaveLength(2);
  expect(input).toInclude('Continue the work that is not done yet.');
});

test('it keeps the cut work of a task whose continuing turn passed the context window, and continues it after the summary', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies(
    'worker',
    {
      text: 'Checking the tides.',
      stopReason: 'tool_use',
      gate: async () => {
        await writeTaskControl(ctx.context, { taskID, control: 'pause' });
        await writeTaskControl(ctx.context, { taskID, control: 'interrupt' });

        await waitForCondition(() =>
          ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
        );
      },
    },
    { overflow: 'prompt_too_long' },
  );

  await ctx.runNextStep(runner);

  await writeTaskControl(ctx.context, { taskID, control: 'resume' });

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  const input =
    ctx.guest.turns
      .at(-1)
      ?.input.map((message) => message.text)
      .join('\n') ?? '';

  expect(ctx.guest.summaries).toHaveLength(1);
  expect(input).toInclude('Continue the work that is not done yet.');
});

test('it leaves the conversation waiting after the user interrupts its turn, with no new message', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('conversation', {
    text: 'Let me look up the tides.',
    stopReason: 'tool_use',
    gate: async () => {
      await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'interrupt' });

      await waitForCondition(() =>
        ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
      );
    },
  });

  await ctx.writeMessage('conversation', 'When is high tide on Saturday?');
  await ctx.runNextStep(runner);

  expect(ctx.runNextStep(runner)).rejects.toThrow('no task had work to claim');
});

test('it leaves waiting after a raise a task whose turn finished its work at its dollar limit', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      limits: { turns: 25, dollars: 0.03 },
    },
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'The high tide is at 14:10.',
    stopReason: 'end_turn',
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

  const raised = await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 1 } });

  expect(raised).toStrictEqual({
    status: 'raised',
    state: 'waiting',
    isPauseRequested: false,
    limits: { turns: 25, dollars: 1 },
  });
});

test('it interrupts a task turn on the call that reaches its dollar limit with the spend of its earlier turns', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.03 },
    },
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
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.03 },
    },
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

  await ctx.runNextStepWithNoRetryDelay(runner);
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

  expect(ctx.guest.turns).toHaveLength(1);
  expect(errored.map((record) => record.thread)).toStrictEqual([taskID]);
});

test("it gives the retry of a failed turn only the dollars that the turn's spend and a raise leave", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.03 },
    },
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
  await ctx.runNextStep(runner);

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 0.04 } });

  await ctx.runNextStep(runner);

  const notices = await ctx.readKinds('task.limit_notice');

  const [failed, retried] = notices.map(
    (notice) => taskLimitNoticeCodec.decode(notice.payload).used,
  );

  expect(failed).toStrictEqual({ turns: 0, dollars: 0.03 });
  expect(retried?.turns).toBe(1);
  expect(retried?.dollars).toBeCloseTo(0.042, 10);
});

test('it interrupts the retry of a turn whose guest failed below the dollar limit once the retry spends what the failed turn left', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.04 },
    },
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
      text: 'Checking the harbour charts.',
      usage: {
        uncachedInputTokens: 3400,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
    },
  );

  await ctx.runNextStepWithNoRetryDelay(runner);
  await ctx.runNextStep(runner);

  const [notice] = await ctx.readKinds('task.limit_notice');

  expect(notice?.payload).toStrictEqual({
    taskID,
    used: { turns: 1, dollars: expect.toBeWithin(0.04, 0.041) },
    limits: { turns: 25, dollars: 0.04 },
  });
});

test('it counts the spend of a task turn whose commit lost its lease to another runner', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      limits: { turns: 25, dollars: 1 },
    },
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
  });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim !== null, 'the started task is ready to claim');

  const taken: { holder: string | null } = { holder: null };

  await runTaskStep(ctx.context, claim, {
    runStep: async (input) => {
      const result = await runner.runStep(input);

      ctx.clock.advance(60_000);

      const retaken = await claimTask(ctx.context, {
        holder: 'runner-b',
        leaseMs: 60_000,
        taskID,
      });

      taken.holder = retaken?.lease.holder ?? null;

      return result;
    },
    leaseMs: 60_000,
    logger: () => {},
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const run = await readOpenRun(ctx.context.log.writer.db, taskID);

  invariant(run !== null, 'the lost lease left the task run open');

  const usage = await readRunUsage(ctx.context, run);

  expect(taken.holder).toBe('runner-b');
  expect(usage.used).toStrictEqual({ turns: 0, dollars: 0.03 });
});

test('it counts once the spend of a task turn at its dollar limit whose commit lost its lease after its pause', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      limits: { turns: 25, dollars: 0.03 },
    },
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

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim !== null, 'the started task is ready to claim');

  await runTaskStep(ctx.context, claim, {
    runStep: async (input) => {
      const result = await runner.runStep(input);

      ctx.clock.advance(60_000);

      return result;
    },
    leaseMs: 60_000,
    logger: () => {},
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const run = await readOpenRun(ctx.context.log.writer.db, taskID);

  invariant(run !== null, 'the lost lease left the task run open');

  const usage = await readRunUsage(ctx.context, run);

  expect(usage.used).toStrictEqual({ turns: 0, dollars: 0.03 });
});

test('it interrupts a task turn at its own spend that, with a spend recorded after the turn started, reaches the dollar limit', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.03 },
    },
  });

  const runner = await ctx.startRunner();

  // A brief ends its turn's batch, so the second call answers a message that lands during the turn.
  ctx.guest.addKindReplies(
    'worker',
    {
      text: 'The high tides on Saturday are at six and at half past six.',
      usage: {
        uncachedInputTokens: 3334,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
      gate: async () => {
        const run = await readOpenRun(ctx.context.log.writer.db, taskID);

        invariant(run !== null, 'the claim opened a task run');

        await writeFailedTurnSpend(ctx.context, {
          taskID,
          taskRunID: run.runID,
          dollars: 0.01,
        });

        await ctx.writeMessage(taskID, 'And the evening tide?');

        await waitForCondition(() =>
          ctx.guest.received.some((entry) => entry.frame.type === 'message'),
        );
      },
    },
    {
      text: 'The evening tide is at seven.',
      usage: {
        uncachedInputTokens: 3334,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
      gate: () =>
        waitForCondition(() =>
          ctx.guest.received.some((entry) => entry.frame.type === 'interrupt'),
        ),
    },
  );

  await ctx.runNextStep(runner);

  const [notice] = await ctx.readKinds('task.limit_notice');

  expect(notice?.payload).toStrictEqual({
    taskID,
    used: { turns: 1, dollars: expect.toBeWithin(0.03, 0.0301) },
    limits: { turns: 25, dollars: 0.03 },
  });
});

test("it lowers the dollars left of a task turn by the spend of a worker that another step started, which a call's priced tokens do not count", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.04 },
    },
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies(
    'worker',
    {
      text: 'The high tides on Saturday are at six and at half past six.',
      usage: {
        uncachedInputTokens: 3334,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
      gate: async () => {
        const run = await readOpenRun(ctx.context.log.writer.db, taskID);

        invariant(run !== null, 'the claim opened a task run');

        await writeRecords(ctx.context.log, [
          {
            kind: workerTurnEndedCodec.kind,
            definitions: ctx.context.definitions(),
            thread: taskID,
            payload: workerTurnEndedCodec.encode({
              workerRunID: crypto.randomUUID(),
              callID: crypto.randomUUID(),
              taskRunID: run.runID,
              model: 'claude-test-worker',
              profile: 'worker',
              turn: 1,
              inputTokens: 100,
              outputTokens: 10,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              dollars: 0.01,
            }),
            erasable: { text: 'Found 3 cafes.' },
          },
        ]);

        await ctx.writeMessage(taskID, 'And the evening tide?');

        await waitForCondition(() =>
          ctx.guest.received.some((entry) => entry.frame.type === 'message'),
        );
      },
    },
    {
      text: 'The evening tide is at seven.',
      usage: {
        uncachedInputTokens: 3334,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
    },
  );

  await ctx.runNextStep(runner);

  const hold = ctx.steps.at(-1)?.session?.step;

  invariant(hold, 'the task turn gave its step a hold');

  expect(hold.readLeftDollars()).toBeCloseTo(0.04 - 2 * 0.010002 - 0.01, 6);
});

test("it counts once the spend of a worker that the turn started, in the turn's dollars left and in the task run's dollars", async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      report: 'none',
      limits: { turns: 25, dollars: 0.04 },
    },
  });

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies(
    'worker',
    {
      text: 'The high tides on Saturday are at six and at half past six.',
      usage: {
        uncachedInputTokens: 3334,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
      gate: async () => {
        const run = await readOpenRun(ctx.context.log.writer.db, taskID);

        const step = ctx.steps.at(-1);

        invariant(run !== null, 'the claim opened a task run');
        invariant(step?.session?.step, 'the task turn gave its step a hold');

        const workerRunID = crypto.randomUUID();
        const callID = crypto.randomUUID();

        await writeRecords(ctx.context.log, [
          {
            kind: workerRunStartedCodec.kind,
            definitions: ctx.context.definitions(),
            thread: taskID,
            payload: workerRunStartedCodec.encode({
              workerRunID,
              shortID: 'w3k8',
              callID,
              stepRunID: step.stepRunID,
              taskRunID: run.runID,
              model: 'claude-test-worker',
              profile: 'worker',
              tools: [],
              limits: { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 },
              isTaskLimit: false,
            }),
          },
          {
            kind: workerTurnEndedCodec.kind,
            definitions: ctx.context.definitions(),
            thread: taskID,
            payload: workerTurnEndedCodec.encode({
              workerRunID,
              callID,
              taskRunID: run.runID,
              model: 'claude-test-worker',
              profile: 'worker',
              turn: 1,
              inputTokens: 100,
              outputTokens: 10,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              dollars: 0.01,
            }),
            erasable: { text: 'Found 3 cafes.' },
          },
        ]);

        step.session.step.onSpend(0.01);

        await ctx.writeMessage(taskID, 'And the evening tide?');

        await waitForCondition(() =>
          ctx.guest.received.some((entry) => entry.frame.type === 'message'),
        );
      },
    },
    {
      text: 'The evening tide is at seven.',
      usage: {
        uncachedInputTokens: 3334,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
    },
  );

  await ctx.runNextStep(runner);

  const run = await readOpenRun(ctx.context.log.writer.db, taskID);

  invariant(run !== null, 'the task run is still open');

  const usage = await readRunUsage(ctx.context, run);

  const hold = ctx.steps.at(-1)?.session?.step;

  invariant(hold, 'the task turn gave its step a hold');

  expect(hold.readLeftDollars()).toBeCloseTo(0.04 - 2 * 0.010002 - 0.01, 6);
  expect(usage.used.dollars).toBeWithin(0.01, 0.02);
});

test('it caps each task turn at 100 model calls', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.guest.turns[0]?.limits).toStrictEqual({
    modelCalls: 100,
    toolCallWaitMs: 900_000,
  });
});

test('it sleeps the imp of a task whose turn reached its dollar limit with work left', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: {
      model: 'second-look',
      profile: 'router-b',
      limits: { turns: 25, dollars: 0.03 },
    },
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

test('it writes one limit record per limit end, and the record of a carried task run holds the use and totals of the whole piece of work', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { limits: { turns: 1, dollars: 2 } },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 2 } });

  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'And the evening tide.');
  await ctx.runNextStep(runner);

  const reached = await ctx.readKinds('task.limit_reached');

  expect(ctx.guest.turns).toHaveLength(2);

  expect(reached.map((record) => record.payload)).toStrictEqual([
    {
      taskID,
      stepKey: `${taskID}:2`,
      used: { turns: 1, dollars: 0 },
      limits: { turns: 1, dollars: 2 },
    },
    {
      taskID,
      stepKey: `${taskID}:4`,
      used: { turns: 2, dollars: 0 },
      limits: { turns: 2, dollars: 2 },
    },
  ]);
});

test('it runs the next turn of a task paused at its turn limit once the limit is raised', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  const taskID = await ctx.seed.task({
    starter: starter.claim,
    name: 'Tide tables',
    brief: 'Find the high tides for Saturday.',
    options: { limits: { turns: 1, dollars: 2 } },
  });

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

test('it runs a definition task that names no model on the profile of the model role task', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-1');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => run.model)).toStrictEqual([
    { model: 'claude-test-errands', profile: 'errands' },
  ]);
});

test('it runs a definition task on the profile of the selectable model its version names', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { model: 'second-look' },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-2');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => run.model)).toStrictEqual([
    { model: 'other-family-test-3', profile: 'router-b' },
  ]);
});

test('it starts the tool list of a definition task from the version its task run pins', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { tools: ['tasks.list'] },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-3');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => run.tools)).toStrictEqual([
    ['tasks.list', 'turn.end_silently', 'task.report'],
  ]);
});

test('it adds the memory tools that only read to the tool list of a definition task with memory read', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { memory: 'read', tools: ['tasks.list', 'memory.recall'] },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-3');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => run.tools)).toStrictEqual([
    ['tasks.list', 'memory.recall', 'moment.find', 'turn.end_silently', 'task.report'],
  ]);
});

test('it adds the read tools and the self-note write tools to a definition task with self notes, and marks its run granted', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'tidy-the-notes',
    definitionHash: 'hash-1',
    version: { memory: 'self_notes', tools: ['tasks.list'] },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-3');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs).toMatchObject([
    {
      tools: [
        'tasks.list',
        'memory.recall',
        'moment.find',
        'memory.remember',
        'memory.edit',
        'memory.retopic',
        'memory.retire',
        'turn.end_silently',
        'task.report',
      ],
      hasSelfNoteGrant: true,
      selfNoteOnlyTools: ['memory.remember', 'memory.edit', 'memory.retopic', 'memory.retire'],
    },
  ]);
});

test('it leaves the run of a started task ungranted, whatever memory its stored options hold', async () => {
  const ctx = await setupTest();
  const starter = await ctx.seed.conversationStep();

  await ctx.seed.task({
    starter: starter.claim,
    name: 'Tidy the notes',
    brief: 'Merge the duplicate notes about yourself.',
    options: { persona: 'default', memory: 'self_notes' },
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => 'hasSelfNoteGrant' in run)).toStrictEqual([false]);
});

test('it keeps a memory write tool that the list of a definition task with self notes names, as it does at memory read', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'tidy-the-notes',
    definitionHash: 'hash-1',
    version: { memory: 'self_notes', tools: ['tasks.list', 'memory.fold', 'memory.edit'] },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-3');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => run.tools)).toStrictEqual([
    [
      'tasks.list',
      'memory.fold',
      'memory.edit',
      'memory.recall',
      'moment.find',
      'memory.remember',
      'memory.retopic',
      'memory.retire',
      'turn.end_silently',
      'task.report',
    ],
  ]);
});

test('it limits to self-notes the self-note tools that only the grant gives a definition task', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'tidy-the-notes',
    definitionHash: 'hash-1',
    version: { memory: 'self_notes', tools: ['tasks.list', 'memory.fold', 'memory.edit'] },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-3');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => run.selfNoteOnlyTools)).toStrictEqual([
    ['memory.remember', 'memory.retopic', 'memory.retire'],
  ]);
});

test('it leaves the run of a definition task with memory read ungranted', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { memory: 'read', tools: ['tasks.list'] },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-3');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => 'hasSelfNoteGrant' in run)).toStrictEqual([false]);
});

test('it starts a new endpoint for a task run that pins another version of a definition task', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { tools: ['tasks.list'] },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-4');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-2',
    version: { tools: ['tasks.list', 'task.message'] },
  });

  await ctx.writeFire(taskID, 'hash-2', 'fire-5');
  await ctx.runNextStep(runner);

  expect(ctx.runs.map((run) => run.tools)).toStrictEqual([
    ['tasks.list', 'turn.end_silently', 'task.report'],
    ['tasks.list', 'task.message', 'turn.end_silently', 'task.report'],
  ]);
});

test('it opens a fresh session at each task run of a definition task with a fresh context', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { context: 'fresh' },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-6');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeFire(taskID, 'hash-1', 'fire-7');
  await ctx.runNextStep(runner);

  const opened = await ctx.readKinds('model.session_opened');

  expect(opened.map((record) => record.payload['kind'])).toStrictEqual(['first', 'first']);
});

test('it resumes the session of the last task run of a definition task with a continuing context', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { context: 'continuing' },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-8');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeFire(taskID, 'hash-1', 'fire-9');
  await ctx.runNextStep(runner);

  const opened = await ctx.readKinds('model.session_opened');

  expect(opened.map((record) => record.payload['kind'])).toStrictEqual(['first']);
});

test('it gives the first turn of a definition task run the time the definition was first enabled and the start of the run', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-1');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const [enabled] = await ctx.readKinds('task.definition_set');
  const [opened] = await ctx.readKinds('task.run_opened');

  const input = ctx.guest.turns[0]?.input.map((message) => message.text).join('\n') ?? '';

  invariant(enabled && opened, 'the definition is enabled and its task run opened');

  expect(input).toInclude(
    `<input name="since">Your previous run started at ${enabled.recordedAt.toISOString()}. This run started at ${opened.recordedAt.toISOString()}. Read messages from the first time up to the second.</input>`,
  );
});

test('it renders the since block once in the rebuilt session of a definition task run, and in no resumed turn', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    policy: { wakeable: true },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-1');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeLegacyOpening(taskID);
  await ctx.writeMessage(taskID, 'Only the morning tide, please.');
  await ctx.runNextStep(runner);
  await ctx.writeMessage(taskID, 'And the evening one.');
  await ctx.runNextStep(runner);

  const [first, rebuilt, resumed] = ctx.guest.turns.map((turn) =>
    turn.input.map((message) => message.text).join('\n'),
  );

  expect(rebuilt?.split('<input name="since">')).toHaveLength(2);
  expect(rebuilt).toInclude(first?.match(/<input name="since">.*<\/input>/u)?.[0] ?? 'no block');
  expect(resumed).not.toInclude('<input name="since">');
});

test('it renders no since block at the first turn of a carried definition task run, which resumes the session that holds it', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { model: 'second-look' },
    policy: { limits: { turns: 25, dollars: 0.03, calls: {} } },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-1');

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the soil.',
    stopReason: 'tool_use',
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

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 1 } });

  await ctx.runNextStep(runner);

  const opened = await ctx.readKinds('task.run_opened');

  const [first, carried] = ctx.guest.turns;
  const firstInput = first?.input.map((message) => message.text).join('\n') ?? '';
  const carriedInput = carried?.input.map((message) => message.text).join('\n') ?? '';

  expect(opened.map((record) => record.payload['origin'])).toStrictEqual([
    { kind: 'trigger', sequence: expect.any(Number) },
    { kind: 'raise', sequence: expect.any(Number) },
  ]);

  expect(carried?.resume?.sessionID).toBeString();
  expect(firstInput).toInclude('<input name="since">');
  expect(firstInput).toInclude('<task-message id="');
  expect(carriedInput).not.toInclude('<input name="since">');
  expect(carriedInput).not.toInclude('<task-message id="');
});

test("it sends no text for the fire that opens a definition task run, marks the fire read, and renders the run's blocks and brief", async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Check the soil and water what is dry.' },
  });

  const fire = await ctx.writeFire(taskID, 'hash-1', 'fire-1');
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const input = ctx.guest.turns[0]?.input.map((message) => message.text).join('\n') ?? '';

  const progress = await readTestTaskProgress(ctx.context, taskID);
  const [briefID] = await ctx.readBriefIDs();

  expect(input).not.toInclude('trigger.fired');
  expect(input).toInclude('<input name="trigger">');

  expect(input).toInclude(
    `<task-message id="${String(briefID)}" from="task definition: Water the tomatoes" kind="request"`,
  );

  expect(input).toMatch(/\nCheck the soil and water what is dry\.\n<\/task-message fence="\w+">$/u);
  expect(progress.readCursor).toBeGreaterThanOrEqual(fire);
});

test("it renders a message that waits behind a fire, and marks both read, in the first turn of a definition task run's session", async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Check the soil and water what is dry.' },
    policy: { wakeable: true },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-1');

  const [message] = await ctx.writeMessage(taskID, 'Skip the front bed.');
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  const input = ctx.guest.turns[0]?.input.map((entry) => entry.text).join('\n') ?? '';

  const progress = await readTestTaskProgress(ctx.context, taskID);

  expect(input).not.toInclude('trigger.fired');
  expect(input.indexOf('Check the soil')).toBeLessThan(input.indexOf('Skip the front bed.'));
  expect(progress.readCursor).toBeGreaterThanOrEqual(message?.sequence ?? Infinity);
});

test('it renders the brief of a definition task run once, last in the preamble, before the message that opened it, and renders the same brief ID on the rerun of its first step', async () => {
  const ctx = await setupTest();

  const failing = buildStubToolEndpoint({ failedStarts: 1 });

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Check the soil and water what is dry.' },
    policy: { wakeable: true },
  });

  await ctx.writeMessage(taskID, 'Start with the greenhouse.');

  const runner = await ctx.startRunner({ tools: failing.endpoint });

  await ctx.runNextStepWithNoRetryDelay(runner);
  await ctx.runNextStep(runner);

  const [briefID] = await ctx.readBriefIDs();

  const input = ctx.guest.turns[0]?.input.map((entry) => entry.text).join('\n') ?? '';

  expect(ctx.guest.turns).toHaveLength(1);
  expect(input.split('<task-message id="')).toHaveLength(2);
  expect(input).toInclude(`<task-message id="${String(briefID)}"`);
  expect(input.indexOf('Check the soil')).toBeLessThan(input.indexOf('Start with the greenhouse.'));
});

test('it pins the brief and the run blocks of an open definition task run in the opening of its rebuilt session, and leaves the preamble none', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes', brief: 'Check the soil and water what is dry.' },
    policy: { wakeable: true },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-1');

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.writeLegacyOpening(taskID);
  await ctx.writeMessage(taskID, 'Only the morning round, please.');
  await ctx.runNextStep(runner);

  const [briefID] = await ctx.readBriefIDs();

  const rebuilt = ctx.guest.turns[1]?.input.map((entry) => entry.text).join('\n') ?? '';
  const preambleOnly = rebuilt.slice(rebuilt.lastIndexOf('Only the morning round, please.'));

  expect(rebuilt.split('<input name="trigger">')).toHaveLength(2);
  expect(rebuilt.split(`<task-message id="${String(briefID)}"`)).toHaveLength(2);

  expect(rebuilt.indexOf('<input name="trigger">')).toBeLessThan(
    rebuilt.indexOf('<task-message id="'),
  );

  expect(preambleOnly).not.toInclude('<input name=');
});

test('it pins in the opening of a rebuilt session the brief ID that a carried definition task run copies from the run it carries', async () => {
  const ctx = await setupTest();

  const taskID = await ctx.writeDefinitionTask({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { model: 'second-look', brief: 'Check the soil and water what is dry.' },
    policy: { limits: { turns: 25, dollars: 0.03, calls: {} }, wakeable: true },
  });

  await ctx.writeFire(taskID, 'hash-1', 'fire-1');

  const runner = await ctx.startRunner();

  ctx.guest.addKindReplies('worker', {
    text: 'Checking the soil.',
    stopReason: 'tool_use',
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

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { dollars: 1 } });

  await ctx.runNextStep(runner);
  await ctx.writeLegacyOpening(taskID);
  await ctx.writeMessage(taskID, 'Only the morning round, please.');
  await ctx.runNextStep(runner);

  const briefIDs = await ctx.readBriefIDs();

  const rebuilt =
    ctx.guest.turns
      .at(-1)
      ?.input.map((entry) => entry.text)
      .join('\n') ?? '';

  expect(briefIDs).toHaveLength(2);
  expect(briefIDs[1]).toBe(briefIDs[0]);
  expect(rebuilt).toInclude(`<task-message id="${String(briefIDs[0])}"`);
});
