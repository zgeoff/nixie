import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { modelsConfigSchema } from '@heynixie/models';
import { claimTask, runTaskStep, writeInboxRecords, writeTaskControl } from '@heynixie/tasks';
import { seedStartedTask } from '@heynixie/tasks/test-utils';
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
          },
        },
        roles: { conversation: 'chat-direct', task: 'errands' },
      }),
      secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
      sandboxes: host.sandboxes,
      image: 'nixie-conversation-0123456789ab',
      tools: parts.tools ?? tools.endpoint,
      toolNames: ['tasks.list', 'task.message', 'time.now'],
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
    seedTask: () =>
      seedStartedTask(host.context, {
        name: 'Tide tables',
        brief: 'Find the high tides for Saturday.',
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
  const taskID = await ctx.seedTask();
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
  const taskID = await ctx.seedTask();
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
  const taskID = await ctx.seedTask();
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
  const taskID = await ctx.seedTask();
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
  const taskID = await ctx.seedTask();
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

  await ctx.seedTask();

  const runner = await ctx.startRunner({ tools: failing.endpoint });

  await ctx.runNextStepWithNoRetryDelay(runner);
  await ctx.runNextStep(runner);

  expect(ctx.guest.turns).toHaveLength(1);
});

test('it destroys the imp of an idle task when the task closes, with no further step', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seedTask();
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  await writeTaskControl(ctx.context, { taskID, control: 'close' });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(taskID);

    return sandboxes.length === 0;
  });

  expect(ctx.guest.turns).toHaveLength(1);
});

test('it keeps destroying the imps of closed tasks after the destroy of one fails', async () => {
  const ctx = await setupTest();
  const stuck = await ctx.seedTask();

  const other = await seedStartedTask(ctx.context, {
    name: 'Ferry times',
    brief: 'Find the last ferry on Sunday.',
  });

  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);
  await ctx.runNextStep(runner);

  ctx.guest.failDestroy(stuck, 'the imp would not stop');

  await writeTaskControl(ctx.context, { taskID: stuck, control: 'close' });
  await waitForCondition(() => ctx.events.includes('nixie_runner.task_remove_failed'));
  await writeTaskControl(ctx.context, { taskID: other, control: 'close' });

  await waitForCondition(async () => {
    const sandboxes = await ctx.sandboxes.list(other);

    return sandboxes.length === 0;
  });

  const stuckSandboxes = await ctx.sandboxes.list(stuck);

  expect(stuckSandboxes).toHaveLength(1);
});

test('it rebuilds the session of a task whose imp is gone with the messages the task sent', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seedTask();
  const runner = await ctx.startRunner();

  await ctx.runNextStep(runner);

  await writeRecords(ctx.context.log, [
    {
      kind: 'task_message',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: {
        messageID: 'r7md3x2kqe',
        from: taskID,
        to: 'conversation',
        kind: 'report',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: false,
        woke: false,
        source: `task:${taskID}`,
      },
      erasable: { body: 'High tide on Saturday is at 06:42 at Bramble Quay.' },
    },
  ]);

  const [lost] = await ctx.sandboxes.list(taskID);

  await lost?.destroy();
  await ctx.writeMessage(taskID, 'And the low tide?');
  await ctx.runNextStep(runner);

  const rebuilt = ctx.guest.turns.at(-1);
  const input = rebuilt?.input.map((message) => message.text).join('\n') ?? '';

  expect(rebuilt?.resume).toBeNull();
  expect(input).toInclude('High tide on Saturday is at 06:42 at Bramble Quay.');
});
