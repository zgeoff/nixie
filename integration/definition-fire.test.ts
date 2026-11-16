import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { modelsConfigSchema, resolveRoleProfile } from '@heynixie/models';
import type { PolicyCall } from '@heynixie/policy';
import { readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { buildStubSandboxes } from '@heynixie/sandbox/test-utils';
import { buildRunSettings, startConversationRunner, startSandboxRunner } from '@heynixie/sessions';
import {
  buildStubMemory,
  buildStubToolEndpoint,
  runNextStep,
  startTestSessionHost,
} from '@heynixie/sessions/test-utils';
import { claimTask, createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { seedDefinitionTask, writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2027-03-08T21:15:00.000Z'));

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
    },
    roles: { conversation: 'chat-direct', task: 'errands' },
  });

  const secrets = { model_credentials: { anthropic: 'not-a-real-key' } };

  const host = await startTestSessionHost({
    clock,
    runSettings: buildRunSettings({ models, secrets, hopLimit: 20 }),
  });

  const tools = buildStubToolEndpoint();
  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const definitions = {
    persona: 'You are Pip.',
    prompts: {},
    personaHash: 'sha256:persona-test',
    policyHash: 'sha256:policy-test',
  };

  const decide = readStarterDecisionPoint((tool) =>
    tool === 'test.send'
      ? {
          effects: ['send'],
          destinations: ['to'],
          amount: null,
          content: ['body'],
          results: { delivered: 'untrusted' },
        }
      : null,
  );

  return {
    ...host,
    clock,
    runs: tools.runs,
    steps: tools.steps,
    startTaskRunner: () =>
      startSandboxRunner({
        context: host.context,
        models,
        secrets,
        sandboxes: host.sandboxes,
        images: { conversation: 'nixie-conversation-0123456789ab' },
        tools: tools.endpoint,
        memory: () => memory,
        getDefinitions: () => definitions,
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
        defaultZone: 'Australia/Sydney',
        messaging: { directory: [], hopLimit: 20, ownerName: 'Robin', agentName: null },
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
        command: { argv: ['bun', '/opt/nixie/conversation/src/main.ts'], env: {} },
        getDefinitions: () => definitions,
        memory: () => memory,
        defaultZone: 'Australia/Sydney',
        clearFetchPauses: () => {},
        log: () => {},
      }),
    decide: (call: Pick<PolicyCall, 'tool' | 'toolList' | 'context' | 'definitionID'>) =>
      decide({
        args: { to: 'harbour-office@example.org', body: 'The mooring fee is paid.' },
        destinations: [{ value: 'harbour-office@example.org', replyTarget: false }],
        sources: [],
        at: clock.now(),
        turnMessageSequence: null,
        onBehalfOf: [],
        snapshot: 'sha256:test',
        ...call,
      }),
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
          schedule: { every: 'day', at: '06:30', zone: 'Australia/Sydney', catchUp: 'once' },
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

  const policy = ctx.steps[0]?.session?.policy;

  invariant(policy, 'the step opened a session with a policy frame');

  const offered = ctx.runs[0]?.tools ?? [];

  const outside = await ctx.decide({ tool: 'test.send', toolList: ['tasks.list'], ...policy });
  const past = await ctx.decide({ tool: 'test.send', toolList: offered, ...policy });

  const [turn] = ctx.guest.turns;

  expect(fire?.record.contentSource).toBeNull();
  expect(offered).toStrictEqual(['tasks.list', 'test.send', 'turn.end_silently', 'task.report']);

  expect(policy).toStrictEqual({
    context: 'task',
    definitionID: null,
    onBehalfOf: [],
    sources: [],
    turnMessageSequence: null,
  });

  expect(outside.decision.outcome).toBe('deny');
  expect(past.decision.outcome).toBe('ask');

  expect(turn?.input.map((message) => message.text).join('\n')).toInclude(
    '<input name="trigger">\nThis task run was scheduled for Tue 9 Mar, 06:30 and started at 08:15 as a catch-up. Skipped: Mon 8 Mar, 06:30. Times are in Australia/Sydney.\n</input>',
  );
});

test('it wakes the conversation once for a fire and gives it a reminder with the brief and the time it was set for', async () => {
  const ctx = await setupTest();

  const sandboxes = buildStubSandboxes();

  ctx.clock.advance(20_700_000);

  await createConversationTask(ctx.context);

  ctx.definitionStore.add('hash-1', {
    version: {
      definitionID: 'call-the-dentist',
      brief: 'Call the dentist about the crown.',
      trigger: { at: '2027-03-09T14:00:00+11:00' },
    },
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
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ]);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'trigger.fired',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: {
        definitionID: 'call-the-dentist',
        definitionHash: 'hash-1',
        source: 'at',
        dedupeKey: 'call-the-dentist:2027-03-09T03:00:00.000Z',
        kind: 'at',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        firedAt: '2027-03-09T03:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
  ]);

  await runNextStep(ctx.context, runner.runStep);

  const next = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const inputs = sandboxes.turns.map((turn) =>
    turn.input.map((message) => message.text).join('\n'),
  );

  expect(sandboxes.turns).toHaveLength(1);
  expect(next).toBeNull();

  expect(inputs[0]).toMatch(
    /<system-message type="reminder" id="[0-9a-f]+" at="Tue 9 Mar, 14:00, Sydney">\n\[#\d+\] Reminder you set: <model-text id="(?<block>[0-9a-f]+)">Call the dentist about the crown\.<\/model-text id="\k<block>">\nIt was set for Tue 9 Mar, 14:00, Sydney\.\n<\/system-message id="[0-9a-f]+">/u,
  );
});
