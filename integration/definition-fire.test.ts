import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { parseJSONObject, readRecords } from '@heynixie/log';
import { modelsConfigSchema, resolveRoleProfile } from '@heynixie/models';
import type { EffectDeclaration } from '@heynixie/policy';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildReminderSetTool, remindersProjections } from '@heynixie/reminders';
import type { SandboxAdapter } from '@heynixie/sandbox';
import { buildSandboxRecorder } from '@heynixie/sandbox';
import { buildStubGuestSandboxes, buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { buildRunSettings, startConversationRunner, startSandboxRunner } from '@heynixie/sessions';
import {
  buildStubMemory,
  buildStubToolEndpoint,
  runNextStep,
  startTestSessionHost,
} from '@heynixie/sessions/test-utils';
import {
  buildTaskMessageTool,
  claimTask,
  createConversationTask,
  readDefinitionTaskInTransaction,
  readOpenRun,
  readTaskDirectory,
  runTaskStep,
  withdrawDefinitionTaskInTransaction,
  writeStepCommit,
} from '@heynixie/tasks';
import {
  seedConversationStep,
  seedDefinitionTask,
  seedOpenDefinitionRun,
  writeTestTaskMessage,
  writeTestTriggerFire,
} from '@heynixie/tasks/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { ToolDefinition, ToolEndpoint } from '@heynixie/tools';
import { buildToolRegistry, startToolEndpoint } from '@heynixie/tools';
import {
  buildMockToolCall,
  buildMockToolContext,
  buildMockToolDefinition,
  sendTestToolCall,
  withTestToolClient,
} from '@heynixie/tools/test-utils';
import { buildScheduleSource, deliverTriggerBatch, triggersProjections } from '@heynixie/triggers';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';

interface TaskRunnerRoute {
  readonly sandboxes: SandboxAdapter;
  readonly tools: Pick<ToolEndpoint, 'startRun'>;
}

async function setupTest() {
  const clock = createFakeClock({ startMs: Date.parse('2027-03-08T21:15:00.000Z') });

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
        prices: {
          input: 0,
          cache_write: 0,
          cache_write_1h: 0,
          cached_input: 0,
          output: 0,
        },
      },
    },
    roles: { conversation: 'chat-direct', task: 'errands' },
  });

  const secrets = { model_credentials: { anthropic: 'not-a-real-key' } };

  const host = await startTestSessionHost({
    clock,
    projections: [...triggersProjections, ...remindersProjections],
    runSettings: buildRunSettings({ models, secrets, hopLimit: 20 }),
  });

  const tools = buildStubToolEndpoint();

  const memory = buildStubMemory({
    pinned: [],
    pinnedUse: { items: 0, tokens: 0, budget: 2000 },
  });

  const definitions = {
    persona: 'You are Pip.',
    prompts: {},
    personaHash: 'sha256:persona-test',
    policyHash: 'sha256:policy-test',
  };

  const declarations: Record<string, EffectDeclaration> = {
    'tasks.list': {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { text: 'owner_data' },
    },
    'test.send': {
      effects: ['send'],
      destinations: ['to'],
      amount: null,
      content: ['body'],
      results: { text: 'untrusted' },
    },
    'test.wipe': {
      effects: ['delete'],
      destinations: [],
      amount: null,
      content: [],
      results: { text: 'owner_data' },
    },
  };

  const mockTools = Object.entries(declarations).map(([name, declaration]) =>
    buildMockToolDefinition({
      name,
      execution: declaration.effects.includes('read') ? 'direct' : 'queued',
      input: {
        properties: { to: { type: 'string' }, body: { type: 'string' } },
        required: [],
      },
      declaration,
    }),
  );

  const queued: string[] = [];

  const setTool = buildReminderSetTool({
    log: host.context.log,
    definitions: host.context.definitions,
    readZone: () => Promise.resolve('Australia/Sydney'),
    minGapMinutes: 15,
  });

  return {
    ...host,
    clock,
    queued,
    runReminderSet: (input: object) => {
      const call = buildMockToolCall({
        tool: 'reminder.set',
        input: parseJSONObject(JSON.stringify(input)),
      });

      return setTool.run(call, buildMockToolContext());
    },
    runFiresUntil: async (advanceMs: number) => {
      const controller = new AbortController();

      const source = buildScheduleSource({
        db: host.context.log.writer.db,
        clock,
        readZone: () => Promise.resolve('Australia/Sydney'),
        readLastMessageAt: () => Promise.resolve(null),
      });

      const core = {
        log: host.context.log,
        clock,
        definitions: host.context.definitions,
        logEvent: () => {},
        readDefinitionTask: readDefinitionTaskInTransaction,
        retireOneShot: (
          tx: Parameters<typeof withdrawDefinitionTaskInTransaction>[0],
          id: string,
        ) => withdrawDefinitionTaskInTransaction(tx, host.context, id),
      };

      onTestFinished(async () => {
        controller.abort();

        await source.stop();
      });

      await source.start({
        cursor: null,
        deliver: (batch) => deliverTriggerBatch(core, 'schedule', batch),
        reportHealth: () => {},
        signal: controller.signal,
      });

      await waitForCondition(() => clock.countPending() === 1);

      clock.advance(advanceMs);

      await waitForCondition(async () => {
        const fired = await readRecords(host.context.log, {
          afterSequence: 0,
          kinds: ['trigger.fired'],
        });

        return fired.length === 1;
      });
    },
    runs: tools.runs,
    steps: tools.steps,
    startTaskRunner: (route?: TaskRunnerRoute) =>
      startSandboxRunner({
        context: host.context,
        models,
        secrets,
        sandboxes: route?.sandboxes ?? host.sandboxes,
        images: { conversation: 'nixie-conversation-0123456789ab' },
        tools: route?.tools ?? tools.endpoint,
        memory: () => memory,
        getDefinitions: () => definitions,
        memorySettings: {
          rebuildTokens: 30_000,
          ownerName: 'Robin',
          agentNames: [],
        },
        memoryReadTools: [],
        compaction: { threshold: 0.8, headsUp: 0.7, summaryTokens: 2000 },
        defaultZone: 'Australia/Sydney',
        messaging: {
          directory: [],
          unlisted: [],
          hopLimit: 20,
          ownerName: 'Robin',
          agentName: null,
        },
        clearFetchPauses: () => {},
        log: () => {},
      }),
    startConversation: (sandboxes: ReturnType<typeof buildStubSandboxes>) =>
      startConversationRunner({
        context: host.context,
        profile: {
          profile: resolveRoleProfile(models, 'conversation'),
          credential: 'not-a-real-key',
        },
        sandboxes: sandboxes.adapter,
        tools: tools.endpoint,
        toolNames: [],
        image: 'conversation',
        limits: { vcpus: 1, memoryMiB: 1024, diskMiB: 2048 },
        command: {
          argv: ['bun', '/opt/nixie/conversation/src/main.ts'],
          env: {},
        },
        getDefinitions: () => definitions,
        memory: () => memory,
        defaultZone: 'Australia/Sydney',
        clearFetchPauses: () => {},
        log: () => {},
      }),
    startToolGuest: (endpoint: Pick<ToolEndpoint, 'getToolTarget'>) =>
      buildStubGuestSandboxes({
        recorder: buildSandboxRecorder({
          log: host.context.log,
          definitions: host.context.definitions,
        }),
        callTool: (call) =>
          sendTestToolCall({
            target: endpoint.getToolTarget({
              id: call.sandboxID,
              owner: call.owner,
            }),
            token: call.token,
            name: call.name,
            input: call.input,
          }),
        countTokens: (text) => text.length,
      }),
    startToolEndpoint: async (extraTools: readonly ToolDefinition[] = []) => {
      const registry = buildToolRegistry([...mockTools, ...extraTools]);

      const endpoint = await startToolEndpoint({
        logger: () => {},
        socketDir: join(host.dataDir, 'run-tools'),
        registry,
        decide: readStarterDecisionPoint(
          (tool) => registry.findTool(tool)?.definition.declaration ?? null,
        ),
        log: host.context.log,
        definitions: host.context.definitions,
        queue: {
          enqueue: () => {
            queued.push('action-1');

            return Promise.resolve({ status: 'queued', actionID: 'action-1' });
          },
          readOpenRepeat: () => Promise.resolve(null),
          readOpenAsk: () => Promise.resolve(null),
          waitForOutcome: () => Promise.resolve(null),
        },
      });

      host.defer(() => endpoint.stop());

      return endpoint;
    },
  };
}

test('it starts the task run of a fire untrusted, holds it to its version tools and puts the fire times in its first input', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(
    { ...ctx, writer: ctx.context.log.writer },
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
      version: {
        tools: ['tasks.list', 'test.send'],
        trigger: {
          schedule: {
            every: 'day',
            at: '06:30',
            zone: 'Australia/Sydney',
            catchUp: 'once',
          },
        },
      },
    },
  );

  const fireSequence = await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    scheduledFor: '2027-03-08T19:30:00.000Z',
    firedAt: '2027-03-08T21:15:00.000Z',
    isCatchUp: true,
    skipped: ['2027-03-07T19:30:00.000Z'],
    skippedCount: 1,
  });

  const runner = await ctx.startTaskRunner();

  ctx.defer(() => runner.stop());

  await runNextStep(ctx.context, runner.runStep);

  const [fire] = await readRecords(ctx.context.log, {
    afterSequence: fireSequence - 1,
    sequences: [fireSequence],
  });

  const session = ctx.steps[0]?.session;

  invariant(session?.policy, 'the step opened a session with a policy frame');

  const offered = ctx.runs[0]?.tools ?? [];

  const endpoint = await ctx.startToolEndpoint();

  const run = await endpoint.startRun({
    runID: 'run-fire',
    toolUseMetaKey: null,
    thread: taskID,
    logThread: taskID,
    tools: offered,
    model: { model: 'claude-test-errands', profile: 'errands' },
  });

  const step = run.startStep('step-fire', session);

  const calls = await withTestToolClient(
    { target: run.target, token: step.token },
    async (client) => {
      const listed = await client.listTools();

      const outside = await client.callTool({
        name: 'test.wipe',
        arguments: {},
      });

      const past = await client.callTool({
        name: 'test.send',
        arguments: {
          to: 'harbour-office@example.org',
          body: 'The mooring fee is paid.',
        },
      });

      return { listed: listed.tools.map((tool) => tool.name), outside, past };
    },
  );

  const after = await readRecords(ctx.context.log, {
    afterSequence: fireSequence,
  });

  const decisions = after
    .filter((entry) => entry.record.kind === 'tool_called')
    .map((entry) => entry.record.decision?.outcome);

  const [turn] = ctx.guest.turns;

  expect(fire?.record.contentSource).toBeNull();
  expect(offered).toStrictEqual(['tasks.list', 'test.send', 'turn.end_silently', 'task.report']);
  expect(calls.listed).toStrictEqual(['tasks.list', 'test.send']);

  expect(session.policy).toStrictEqual({
    context: 'task',
    definitionID: null,
    onBehalfOf: [],
    sources: [],
    turnMessageSequence: null,
  });

  expect(calls.outside).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: "denied: The tool test.wipe is not on this run's tool list.",
      },
    ],
  });

  expect(decisions).toStrictEqual(['deny', 'ask']);

  expect(calls.past).toMatchObject({
    isError: false,
    content: [{ type: 'text', text: expect.stringContaining('Waiting for approval') }],
  });

  expect(ctx.queued).toStrictEqual([]);

  expect(turn?.input.map((message) => message.text).join('\n')).toInclude(
    '<input name="trigger">\nThis task run was scheduled for Tue 9 Mar, 06:30 and started at 08:15 as a catch-up. Skipped: Mon 8 Mar, 06:30. Times are in Australia/Sydney.\n</input>',
  );
});

test.each([
  ['a one-time reminder', { at: '2027-03-09T14:00:00+11:00' } as const],
  [
    'a recurring reminder',
    {
      schedule: {
        repeat: { frequency: 'weekly', byDay: ['tue'], at: ['14:00'] },
        zone: 'Australia/Sydney',
        catchUp: 'once',
      },
    } as const,
  ],
])(
  'it wakes the conversation once for a fire of %s and gives it a reminder with the note, the name and the time it was set for',
  async (_name, trigger) => {
    const ctx = await setupTest();

    const sandboxes = buildStubSandboxes();

    await createConversationTask(ctx.context);

    const set = await ctx.runReminderSet({
      name: 'Call the dentist',
      note: 'Call the dentist about the crown.',
      trigger,
    });

    const runner = await ctx.startConversation(sandboxes);

    ctx.defer(() => runner.stop());

    sandboxes.setGuestScript((turn) => [
      { type: 'read', uuids: turn.input.map((message) => message.uuid) },
      {
        type: 'assistant',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
        text: 'I will remind you to call.',
        toolUses: [],
      },
      {
        type: 'ended',
        boundary: {
          harness: 'agent-sdk',
          sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d001',
          messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d002',
        },
        outcome: 'finished',
        stopReason: 'end_turn',
        turns: 1,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
    ]);

    await ctx.runFiresUntil(20_760_000);

    await runNextStep(ctx.context, runner.runStep);

    const next = await claimTask(ctx.context, {
      holder: 'runner-a',
      leaseMs: 60_000,
    });

    const inputs = sandboxes.turns.map((turn) =>
      turn.input.map((message) => message.text).join('\n'),
    );

    expect(set.status).toBe('ok');
    expect(sandboxes.turns).toHaveLength(1);
    expect(next).toBeNull();

    expect(inputs[0]).toMatch(
      /<system-message type="reminder" id="[0-9a-f]+" at="Tue 9 Mar, 14:01, Sydney">\n\[#\d+\] Reminder: <model-text id="(?<block>[0-9a-f]+)">Call the dentist about the crown\.<\/model-text id="\k<block>">\nName: <model-text id="[0-9a-f]+">Call the dentist<\/model-text id="[0-9a-f]+">\nIt was set for Tue 9 Mar, 14:00, Sydney\.\nYou can handle this now, hand it to a task, set a one-off for later, or snooze or skip it\.\n<\/system-message id="[0-9a-f]+">/u,
    );
  },
);

test('it starts a task run of a wakeable definition task on a question from the conversation, and wakes the conversation with its reply', async () => {
  const ctx = await setupTest();
  const conversationStep = await seedConversationStep(ctx.context);

  const taskID = await seedDefinitionTask(
    { ...ctx, writer: ctx.context.log.writer },
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
      version: { wakeable: true, tools: ['task.message'] },
      policy: { wakeable: true },
    },
  );

  const messaging = await readTaskDirectory(ctx.context, {
    directory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks with the owner.',
        wakeable: true,
        speaker: 'conversation',
      },
    ],
    unlisted: [],
    hopLimit: 20,
    ownerName: 'Robin',
    agentName: null,
  });

  const question = await writeTestTaskMessage(ctx.context, messaging, {
    from: 'conversation',
    to: taskID,
    kind: 'question',
    body: 'Did the tomatoes get water this morning?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  invariant(question.status === 'sent', 'the question was sent');

  await writeStepCommit(ctx.context, conversationStep.claim, {
    next: 'wait',
    records: [],
    acknowledged: [conversationStep.messageSequence],
  });

  const endpoint = await ctx.startToolEndpoint([buildTaskMessageTool(ctx.context, messaging)]);

  const taskGuest = ctx.startToolGuest(endpoint);

  const taskRunner = await ctx.startTaskRunner({
    sandboxes: taskGuest.adapter,
    tools: endpoint,
  });

  ctx.defer(() => taskRunner.stop());

  taskGuest.addKindReplies(
    'worker',
    {
      toolUse: {
        name: 'task.message',
        input: {
          to: 'conversation',
          kind: 'reply',
          body: 'Yes, at 06:30.',
          replyTo: question.messageID,
        },
      },
    },
    { text: 'Replied.' },
  );

  await runNextStep(ctx.context, taskRunner.runStep);

  const run = await readOpenRun(ctx.context.log.writer.db, taskID);

  const taskInput = taskGuest.turns.map((turn) =>
    turn.input.map((message) => message.text).join('\n'),
  );

  const sandboxes = buildStubSandboxes();

  const conversationRunner = await ctx.startConversation(sandboxes);

  ctx.defer(() => conversationRunner.stop());

  sandboxes.setGuestScript((turn) => [
    { type: 'read', uuids: turn.input.map((message) => message.uuid) },
    {
      type: 'assistant',
      messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d012',
      text: 'The tomatoes were watered at 06:30.',
      toolUses: [],
    },
    {
      type: 'ended',
      boundary: {
        harness: 'agent-sdk',
        sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d011',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d012',
      },
      outcome: 'finished',
      stopReason: 'end_turn',
      turns: 1,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    },
  ]);

  await runNextStep(ctx.context, conversationRunner.runStep);

  const woken = sandboxes.turns.map((turn) => turn.input.map((message) => message.text).join('\n'));

  expect(question.woke).toBe(true);
  expect(run?.opened.origin.kind).toBe('message');
  expect(taskInput).toHaveLength(1);
  expect(taskInput[0]).toInclude('Did the tomatoes get water this morning?');
  expect(woken).toHaveLength(1);
  expect(woken[0]).toInclude('Yes, at 06:30.');
});

test.each([
  {
    title: 'a definition in force',
    leaveForce: async () => {},
  },
  {
    title: 'a definition that left force after the task run ended',
    leaveForce: async (ctx: Awaited<ReturnType<typeof setupTest>>) => {
      await seedDefinitionTask(
        { ...ctx, writer: ctx.context.log.writer },
        { definitionID: 'water-the-tomatoes', definitionHash: null },
      );
    },
  },
])(
  'it labels the report of a task of $title with the name of the definition and the task ID',
  async (row) => {
    const ctx = await setupTest();
    const conversationStep = await seedConversationStep(ctx.context);

    const taskID = await seedDefinitionTask(
      { ...ctx, writer: ctx.context.log.writer },
      {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        version: { name: 'Water the tomatoes', persona: 'none' },
      },
    );

    const taskClaim = await seedOpenDefinitionRun(ctx.context, {
      taskID,
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
    });

    const messaging = await readTaskDirectory(ctx.context, {
      directory: [
        {
          taskID: 'conversation',
          name: 'Conversation',
          brief: 'Talks with the owner.',
          wakeable: true,
          speaker: 'conversation',
        },
      ],
      unlisted: [],
      hopLimit: 20,
      ownerName: 'Robin',
      agentName: null,
    });

    const report = await writeTestTaskMessage(ctx.context, messaging, {
      from: taskID,
      to: 'conversation',
      kind: 'report',
      body: 'The tomatoes are watered.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    });

    invariant(report.status === 'sent', 'the report was sent');

    await writeStepCommit(ctx.context, taskClaim, {
      next: 'wait',
      records: [],
      acknowledged: [],
      run: { activity: 'worked', report: { summary: 'Watered.' } },
    });

    await writeStepCommit(ctx.context, conversationStep.claim, {
      next: 'wait',
      records: [],
      acknowledged: [conversationStep.messageSequence],
    });

    await row.leaveForce(ctx);

    const sandboxes = buildStubSandboxes();

    const runner = await ctx.startConversation(sandboxes);

    ctx.defer(() => runner.stop());

    sandboxes.setGuestScript((turn) => [
      { type: 'read', uuids: turn.input.map((message) => message.uuid) },
      {
        type: 'assistant',
        messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d022',
        text: 'The tomatoes were watered.',
        toolUses: [],
      },
      {
        type: 'ended',
        boundary: {
          harness: 'agent-sdk',
          sessionID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d021',
          messageID: '7d3c1a52-8a3c-4b46-9a4e-1c51f0f6d022',
        },
        outcome: 'finished',
        stopReason: 'end_turn',
        turns: 1,
        usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    ]);

    const claim = await claimTask(ctx.context, {
      holder: 'runner-a',
      leaseMs: 60_000,
      taskID: 'conversation',
    });

    invariant(claim, 'the conversation is ready to claim');

    await runTaskStep(ctx.context, claim, {
      runStep: runner.runStep,
      leaseMs: 60_000,
      logger: () => {},
      maxStepErrors: 3,
      retryDelayMs: 30_000,
      maxRetryDelayMs: 300_000,
    });

    const woken = sandboxes.turns.map((turn) =>
      turn.input.map((message) => message.text).join('\n'),
    );

    expect(woken.join('\n')).toInclude(`from="task: Water the tomatoes (${taskID})" kind="report"`);
  },
);
