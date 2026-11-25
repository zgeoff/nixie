import { expect, test } from 'bun:test';
import { budgetProjections } from '@heynixie/budgets';
import { createTestCredentials } from '@heynixie/credentials/test-utils';
import type { JSONObject, RecordKinds } from '@heynixie/log';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildLogSeeder } from '@heynixie/log/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import { sandboxCreatedCodec } from '@heynixie/sandbox';
import { createPlanLoginsHolder, spendProjections } from '@heynixie/spend';
import { buildStubSpendGateway } from '@heynixie/spend/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { GuestToolRun, ToolOutcome, ToolStepHold } from '@heynixie/tools';
import { buildMockToolContext, buildMockToolDefinition } from '@heynixie/tools/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { startTestSessionHost } from '../test-utils/start-test-session-host';
import { startWorkerTool } from './start-worker-tool';

interface SetupConfig {
  // the first sandbox's first destroy fails
  readonly isFirstDestroyFailing?: boolean;

  // the failed destroy's second try never ends
  readonly isRetryStuck?: boolean;

  // the first sandbox's create never returns
  readonly isFirstCreateStuck?: boolean;

  // the worker's first read of the definitions after its first priced call throws, which fails
  // the end record of a run of one model call
  readonly isEndWriteFailing?: boolean;

  // the gateway counts every model request under its sandbox
  readonly isGatewayOn?: boolean;

  readonly limits?: Readonly<Record<string, number>>;
  readonly workerRuns?: { readonly max: number; readonly whenFull: 'wait' | 'error' };

  // the spending stop's day turn limit; absent means no spending stop
  readonly spendDayTurns?: number;

  // the profile of the worker role; worker-plan is a codex profile with a ChatGPT plan login
  readonly workerProfile?: 'worker-direct' | 'worker-plan';
}

async function setupTest(config: SetupConfig = {}) {
  const clock = createFakeClock({ startMs: 1_000_000 });

  const fetchTool = buildMockToolDefinition({
    name: 'notes_read',
    run: () => Promise.resolve({ status: 'ok', result: { text: 'Found 3 cafes.' } }),
  });

  const host = await startTestSessionHost({
    clock,
    tools: [fetchTool],
    projections: [...spendProjections, ...budgetProjections],
  });

  const prices = { input: 3, cache_write: 3.75, cache_write_1h: 6, cached_input: 0.3, output: 15 };

  const models = modelsConfigSchema.parse({
    profiles: {
      'chat-direct': {
        harness: 'agent-sdk',
        base_url: 'https://models.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'low',
        prices,
      },
      'worker-direct': {
        harness: 'agent-sdk',
        base_url: 'https://models.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-worker',
        effort: 'low',
        prices,
      },
      'big-direct': {
        harness: 'agent-sdk',
        base_url: 'https://big.example.test',
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-big',
        effort: 'high',
        prices: { ...prices, input: 30 },
      },
      'worker-plan': {
        harness: 'codex',
        base_url: 'https://chatgpt.com',
        credential: 'deployment:worker-plan',
        chatgpt_login: true,
        model: 'house-model-1',
        effort: 'low',
        prices,
      },
    },
    roles: {
      conversation: 'chat-direct',
      worker: config.workerProfile ?? 'worker-direct',
    },
    selectable: {
      big: { profile: 'big-direct', description: 'Slower and stronger.' },
      careful: { profile: 'big-direct', description: 'Asks first.', ask: true },
    },
    limits: { workerRun: config.limits ?? {} },
  });

  const destroys: string[] = [];
  const state = { isCreated: false };

  const sandboxes: typeof host.sandboxes = {
    ...host.sandboxes,
    create: async (spec) => {
      if (config.isFirstCreateStuck === true && !state.isCreated) {
        state.isCreated = true;

        return new Promise<never>(() => {});
      }

      const sandbox = await host.sandboxes.create(spec);

      const isFailing = config.isFirstDestroyFailing === true && !state.isCreated;

      state.isCreated = true;

      return {
        ...sandbox,
        destroy: async () => {
          destroys.push(spec.owner);

          if (isFailing && destroys.length === 1) {
            throw new Error('the daemon did not answer');
          }

          if (config.isRetryStuck === true && destroys.length === 2) {
            await new Promise<never>(() => {});
          }

          await sandbox.destroy();
        },
      };
    },
  };

  const spent: number[] = [];
  const stoppedRuns: string[] = [];
  const startedRuns: GuestToolRun[] = [];
  const endWrite = { hasFailed: false };

  const readDefinitions: typeof host.context.definitions = () => {
    if (config.isEndWriteFailing === true && spent.length > 0 && !endWrite.hasFailed) {
      endWrite.hasFailed = true;
      throw new Error('the definitions could not be read');
    }

    return host.context.definitions();
  };

  const gateway = buildStubSpendGateway();

  // each spending check reads the time once, so a test can wait for a call's check
  const spendChecks = { count: 0 };

  const worker = await startWorkerTool({
    models,
    credentials: await createTestCredentials({
      model_credentials: { anthropic: 'not-a-real-key' },
    }),
    sandboxes,
    images: {
      conversation: 'nixie-conversation-0123456789ab',
      codex: 'nixie-codex-0123456789ab',
    },
    log: host.context.log,
    definitions: readDefinitions,
    clock,
    logger: () => {},
    readTools: () => ({
      startRun: async (options) => {
        startedRuns.push(options);

        const run = await host.endpoint.startRun(options);

        return {
          ...run,
          stop: async () => {
            stoppedRuns.push(run.runID);

            await run.stop();
          },
        };
      },
    }),
    ...(config.workerRuns === undefined ? {} : { workerRuns: config.workerRuns }),
    ...(config.isGatewayOn === true ? { gateway } : {}),
    ...(config.spendDayTurns === undefined
      ? {}
      : {
          spend: {
            gateway,
            log: host.context.log,
            clock: {
              now: () => {
                spendChecks.count += 1;

                return clock.now();
              },
              sleep: clock.sleep,
            },
            zone: 'UTC',
            limits: { dayTurns: config.spendDayTurns, dayTurnCap: 2000, monthTurns: 20_000 },
            definitions: host.context.definitions,
            planLogins: createPlanLoginsHolder(),
          },
        }),
  });

  host.defer(() => worker.stop());

  const tool = worker.buildTool({
    memoryTools: { read: ['memory.recall'], write: ['memory.remember'] },
    conversationTools: ['log.forget'],
    models: [
      { name: 'big', profile: 'big-direct', description: 'Slower and stronger.', missing: [] },
    ],
  });

  await writeRecords(host.context.log, [
    {
      kind: 'owner_message',
      definitions: host.context.definitions(),
      thread: 'task-1',
      erasable: { text: 'Find cafes.' },
    },
  ]);

  const [parent] = await readRecords(host.context.log, {
    afterSequence: 0,
    order: 'newest',
    limit: 1,
  });

  invariant(parent, 'the call has a record to hang its worker on');

  const caller = new AbortController();
  const interrupt = new AbortController();

  const hold: ToolStepHold = {
    signal: caller.signal,
    interrupt: interrupt.signal,
    readLeftDollars: () => 1,
    onSpend: (dollars) => {
      spent.push(dollars);
    },
  };

  const callWorker = (
    input: JSONObject,
    overrides: {
      readonly hold?: Partial<ToolStepHold>;
      readonly tools?: readonly string[];
      readonly hasSelfNoteGrant?: boolean;
    } = {},
  ): Promise<ToolOutcome> =>
    tool.run(
      { callID: crypto.randomUUID(), tool: 'worker.run', input, toolUseID: null },
      buildMockToolContext({
        callSequence: parent.record.sequence,
        run: {
          thread: 'task-1',
          logThread: 'task-1',
          tools: overrides.tools ?? ['notes_read'],
          ...(overrides.hasSelfNoteGrant === undefined
            ? {}
            : { hasSelfNoteGrant: overrides.hasSelfNoteGrant }),
          stepRunID: 'step-a',
          session: {
            key: 'session-1',
            invalidatedThrough: 0,
            step: { ...hold, ...overrides.hold },
          },
        },
      }),
    );

  return {
    ...host,
    seed: buildLogSeeder(host.context),
    clock,
    gateway,
    spendChecks,
    spent,
    destroys,
    stoppedRuns,
    startedRuns,
    caller,
    interrupt,
    callWorker,
    stop: () => worker.stop(),
    readKinds: async (kinds: readonly (keyof RecordKinds)[]) => {
      const entries = await readRecords(host.context.log, { afterSequence: 0, kinds: [...kinds] });

      return entries.map((entry) => entry.record);
    },
    readLedger: async () => {
      const rows =
        await sql`select counter, unit, amount from spend_ledger order by ledger_key`.execute(
          host.context.log.writer.db,
        );

      return rows.rows;
    },
    readOwners: async () => {
      const entries = await readRecords(host.context.log, {
        afterSequence: 0,
        kinds: ['sandbox.created'],
      });

      return entries.map((entry) => sandboxCreatedCodec.decode(entry.record.payload).spec.owner);
    },
  };
}

test("it answers with the worker's last reply and the use of its calls, after a tool call of its own", async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies(
    'worker',
    { toolUse: { name: 'notes_read', input: { query: 'cafes' } } },
    {
      text: 'Three cafes are open.',
      usage: {
        uncachedInputTokens: 1000,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 100,
      },
    },
  );

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      workerRunID: expect.toBeString(),
      answer: 'Three cafes are open.',
      used: {
        minutes: 0,
        turns: expect.toBeNumber(),
        tokens: expect.toBeNumber(),
        dollars: expect.toBeNumber(),
      },
    },
  });
});

test('it answers with the text of a reply that ends with a reasoning block', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', { text: 'The bridge opens at nine.', isReasoningLast: true });

  const outcome = await ctx.callWorker({ question: 'When does the bridge open?' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { answer: 'The bridge opens at nine.' },
  });
});

test('it answers with the text of a reply that ends with a reasoning block, after a tool call of its own', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies(
    'worker',
    { toolUse: { name: 'notes_read', input: { query: 'ferry' } } },
    { text: 'The ferry leaves at six.', isReasoningLast: true },
  );

  const outcome = await ctx.callWorker({ question: 'When does the ferry leave?' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { answer: 'The ferry leaves at six.' },
  });
});

test('it writes one start and one end record for an answered run, and lowers the caller budget by its spend', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', {
    text: 'Three cafes are open.',
    usage: {
      uncachedInputTokens: 1000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
  });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const records = await ctx.readKinds([
    'worker.run_started',
    'worker.turn_ended',
    'worker.run_ended',
  ]);

  expect(records.map((record) => record.kind)).toStrictEqual([
    'worker.run_started',
    'worker.turn_ended',
    'worker.run_ended',
  ]);

  expect(records.at(-1)?.payload['outcome']).toBe('answered');
  expect(ctx.spent).toStrictEqual([0.003]);
});

test('it writes no model turn record for a worker run, so the turn count counts it once', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', {
    text: 'Done.',
    usage: {
      uncachedInputTokens: 1000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
  });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const records = await ctx.readKinds(['model.turn_ended']);

  expect(records).toStrictEqual([]);
});

test('it destroys the sandbox of a run once it ends', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });
  await ctx.stop();

  const [owner] = await ctx.readOwners();

  invariant(typeof owner === 'string', 'the run created a sandbox');

  expect(owner).toStartWith('worker_run:');

  const remaining = await ctx.sandboxes.list(owner);

  expect(remaining).toStrictEqual([]);
});

test.each([
  [
    'tokens',
    { tokens: 1000 },
    { uncachedInputTokens: 5000, outputTokens: 0 },
    'stopped at its tokens limit of 1000',
  ],
  [
    'dollars',
    { dollars: 0.001 },
    { uncachedInputTokens: 1000, outputTokens: 0 },
    'stopped at its dollars limit of $0.00',
  ],
])(
  'it stops a run at its %s limit, with the sentence of that limit',
  async (_name, limits, usage, sentence) => {
    const ctx = await setupTest({ limits });

    ctx.guest.addKindReplies('worker', {
      text: '',
      usage: { cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0, ...usage },
    });

    const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

    expect(outcome).toStrictEqual({ status: 'error', message: expect.toInclude(sentence) });
  },
);

test('it stops a run whose minutes pass, and writes the end with the minutes limit', async () => {
  const ctx = await setupTest({ limits: { minutes: 1 } });

  ctx.guest.addKindReplies('worker', { text: 'Late.', gate: () => new Promise<void>(() => {}) });

  const calling = ctx.callWorker({ question: 'Which cafes are open?' });

  await waitForCondition(() => ctx.guest.received.some((entry) => entry.frame.type === 'turn'));

  ctx.clock.advance(60_000);

  const outcome = await calling;

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('stopped at its minutes limit of 1'),
  });
});

test('it starts the tool run of a worker of a task that holds the self-note grant with no self-note grant', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', { text: 'Three cafes are open.' });

  await ctx.callWorker({ question: 'Which cafes are open?' }, { hasSelfNoteGrant: true });

  expect(
    ctx.startedRuns.map((run) => ({
      thread: run.thread,
      hasSelfNoteGrant: run.hasSelfNoteGrant,
      selfNoteOnlyTools: run.selfNoteOnlyTools,
    })),
  ).toStrictEqual([
    { thread: 'task-1', hasSelfNoteGrant: undefined, selfNoteOnlyTools: undefined },
  ]);
});

test('it refuses a tool that the caller does not hold, and starts no sandbox', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callWorker({ question: 'Which?', tools: ['web_fetch'] });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('you do not hold web_fetch'),
  });

  const owners = await ctx.readOwners();

  expect(owners).toStrictEqual([]);
});

test('it refuses a tool of memory, and writes no worker record', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.callWorker(
    { question: 'Which?', tools: ['memory.recall'] },
    { tools: ['notes_read', 'memory.recall'] },
  );

  const records = await ctx.readKinds(['worker.run_started', 'worker.run_ended']);

  expect({ outcome, records }).toStrictEqual({
    outcome: { status: 'error', message: expect.toInclude('cannot get memory.recall') },
    records: [],
  });
});

test('it refuses a worker at the turn limit of the spending stop, and starts no sandbox', async () => {
  const ctx = await setupTest({ spendDayTurns: 0 });
  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });
  const owners = await ctx.readOwners();

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('Model spending is stopped'),
  });

  expect(owners).toStrictEqual([]);
});

test('it refuses a worker while a spending stop stands, with no spending checks configured, and starts no sandbox', async () => {
  const ctx = await setupTest();

  await ctx.seed.spendStop();

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });
  const owners = await ctx.readOwners();

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('Model spending is stopped'),
  });

  expect(owners).toStrictEqual([]);
});

test('it fails a worker on a plan profile whose login the gateway holds no answer for, and sends no turn', async () => {
  const ctx = await setupTest({ spendDayTurns: 1000, workerProfile: 'worker-plan' });
  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  const turns = ctx.guest.received.flatMap((entry) =>
    entry.frame.type === 'turn' ? [entry.frame] : [],
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('model-gateway chatgpt-login'),
  });

  expect(turns).toStrictEqual([]);
});

test('it refuses a worker whose wait for a slot ends after the turn count reached the limit', async () => {
  const ctx = await setupTest({ spendDayTurns: 1, workerRuns: { max: 1, whenFull: 'wait' } });

  const gate = Promise.withResolvers<void>();

  ctx.guest.addKindReplies('worker', { text: 'First.', gate: () => gate.promise });

  const first = ctx.callWorker({ question: 'First?' });

  await waitForCondition(() => ctx.guest.received.some((entry) => entry.frame.type === 'turn'));

  const checks = ctx.spendChecks.count;
  const second = ctx.callWorker({ question: 'Second?' });

  await waitForCondition(() => ctx.spendChecks.count > checks);

  // a read on the one connection runs after the check's reads, so the second call waits for its slot
  await ctx.readOwners();

  await writeRecords(ctx.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: {},
    },
  ]);

  gate.resolve();

  const outcomes = await Promise.all([first, second]);
  const owners = await ctx.readOwners();

  expect(outcomes).toStrictEqual([
    { status: 'ok', result: expect.toBeObject() },
    { status: 'error', message: expect.toInclude('Model spending is stopped') },
  ]);

  expect(owners).toHaveLength(1);
});

test('it runs a worker under the turn limit of the spending stop', async () => {
  const ctx = await setupTest({ spendDayTurns: 1000 });

  ctx.guest.addKindReplies('worker', { text: 'Three cafes are open.' });

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({ status: 'ok', result: expect.toBeObject() });
});

test('it gives the cap sentence to a call past the cap that errors', async () => {
  const ctx = await setupTest({ workerRuns: { max: 1, whenFull: 'error' } });

  ctx.guest.addKindReplies('worker', { text: 'First.', gate: () => new Promise<void>(() => {}) });

  const first = ctx.callWorker({ question: 'First?' });

  await waitForCondition(() => ctx.guest.received.some((entry) => entry.frame.type === 'turn'));

  const second = await ctx.callWorker({ question: 'Second?' });

  expect(second).toStrictEqual({
    status: 'error',
    message: expect.toInclude('1 workers already run'),
  });

  ctx.caller.abort(new Error('the step ended'));

  const [settled] = await Promise.allSettled([first]);

  expect(settled).toStrictEqual({ status: 'rejected', reason: new Error('the step ended') });
});

test("it rejects the call of an aborted step, and writes the end record with the outcome 'aborted'", async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', { text: 'Late.', gate: () => new Promise<void>(() => {}) });

  const calling = ctx.callWorker({ question: 'Which cafes are open?' });

  await waitForCondition(() => ctx.guest.received.some((entry) => entry.frame.type === 'turn'));

  ctx.caller.abort(new Error('the step ended'));

  expect(calling).rejects.toThrowWithMessage(Error, 'the step ended');

  await calling.catch(() => {});
  await ctx.stop();

  const [ended] = await ctx.readKinds(['worker.run_ended']);

  expect(ended?.payload['outcome']).toBe('aborted');
});

test('it tries a failed destroy again before the next run creates its sandbox', async () => {
  const ctx = await setupTest({ isFirstDestroyFailing: true });

  ctx.guest.addKindReplies('worker', { text: 'One.' }, { text: 'Two.' });

  await ctx.callWorker({ question: 'First?' });

  await waitForCondition(() => ctx.destroys.length === 1);

  await ctx.callWorker({ question: 'Second?' });
  await ctx.stop();

  const [first] = await ctx.readOwners();

  invariant(typeof first === 'string', 'the first run created a sandbox');

  expect(ctx.destroys.filter((owner) => owner === first)).toHaveLength(2);

  const remaining = await ctx.sandboxes.list(first);

  expect(remaining).toStrictEqual([]);
});

test('it ends a run whose failed-destroy retry never ends, when its minutes pass', async () => {
  const ctx = await setupTest({
    isFirstDestroyFailing: true,
    isRetryStuck: true,
    limits: { minutes: 1 },
  });

  ctx.guest.addKindReplies('worker', { text: 'One.' });

  await ctx.callWorker({ question: 'First?' });

  await waitForCondition(() => ctx.destroys.length === 1);

  const second = ctx.callWorker({ question: 'Second?' });

  await waitForCondition(() => ctx.destroys.length === 2);

  ctx.clock.advance(60_000);

  const outcome = await second;
  const ended = await ctx.readKinds(['worker.run_ended']);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('stopped at its minutes limit of 1'),
  });

  expect(ended).toHaveLength(2);
});

test('it ends a run whose failed-destroy retry never ends, when its step aborts', async () => {
  const ctx = await setupTest({ isFirstDestroyFailing: true, isRetryStuck: true });

  ctx.guest.addKindReplies('worker', { text: 'One.' });

  await ctx.callWorker({ question: 'First?' });

  await waitForCondition(() => ctx.destroys.length === 1);

  const second = ctx.callWorker({ question: 'Second?' });

  await waitForCondition(() => ctx.destroys.length === 2);

  ctx.caller.abort(new Error('the step ended'));

  expect(second).rejects.toThrowWithMessage(Error, 'the step ended');

  await second.catch(() => {});

  const ended = await ctx.readKinds(['worker.run_ended']);

  expect(ended).toHaveLength(2);
});

test('it frees the slot of a run whose sandbox create never returns, when its minutes pass', async () => {
  const ctx = await setupTest({
    isFirstCreateStuck: true,
    limits: { minutes: 1 },
    workerRuns: { max: 1, whenFull: 'error' },
  });

  ctx.guest.addKindReplies('worker', { text: 'Second.' });

  const first = ctx.callWorker({ question: 'First?' });

  await waitForCondition(async () => {
    const started = await ctx.readKinds(['worker.run_started']);

    return started.length === 1;
  });

  ctx.clock.advance(60_000);

  const stopped = await first;

  expect(stopped).toStrictEqual({
    status: 'error',
    message: expect.toInclude('stopped at its minutes limit of 1'),
  });

  const second = await ctx.callWorker({ question: 'Second?' });

  expect(second).toStrictEqual({
    status: 'ok',
    result: {
      workerRunID: expect.toBeString(),
      answer: 'Second.',
      used: {
        minutes: 0,
        turns: expect.toBeNumber(),
        tokens: expect.toBeNumber(),
        dollars: expect.toBeNumber(),
      },
    },
  });
});

test('it frees the tool run, the stops, the sandbox and the slot when the end record fails to write', async () => {
  const ctx = await setupTest({
    isEndWriteFailing: true,
    workerRuns: { max: 1, whenFull: 'error' },
  });

  ctx.guest.addKindReplies(
    'worker',
    {
      text: 'First.',
      usage: {
        uncachedInputTokens: 1000,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      },
    },
    { text: 'Second.' },
  );

  const [first] = await Promise.allSettled([ctx.callWorker({ question: 'First?' })]);

  expect(first).toStrictEqual({
    status: 'rejected',
    reason: expect.toBeObject(),
  });

  const [owner] = await ctx.readOwners();

  invariant(typeof owner === 'string', 'the run created a sandbox');

  await waitForCondition(async () => {
    const remaining = await ctx.sandboxes.list(owner);

    return remaining.length === 0;
  });

  const ended = await ctx.readKinds(['worker.run_ended']);

  const stoppedRuns = ctx.stoppedRuns.length;
  const sleepers = ctx.clock.countPending();

  const second = await ctx.callWorker({ question: 'Second?' });

  expect({ ended: ended.length, stoppedRuns, sleepers, second: second.status }).toStrictEqual({
    ended: 0,
    stoppedRuns: 1,
    sleepers: 0,
    second: 'ok',
  });
});

test('it registers the sandbox of a run at the gateway with the planned dollars and tokens', async () => {
  const ctx = await setupTest({ isGatewayOn: true, limits: { dollars: 0.5, tokens: 5000 } });

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([
    [expect.toStartWith('nixie-'), { dollars: 0.5, tokens: 5000 }],
  ]);
});

test('it sends the turn of a run to the base URL with the sandbox name and the profile ID', async () => {
  const ctx = await setupTest({ isGatewayOn: true });

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const [sandboxID] = ctx.gateway.putSandbox.mock.calls[0] ?? [];

  const turns = ctx.guest.received.flatMap((entry) =>
    entry.frame.type === 'turn' ? [entry.frame] : [],
  );

  expect(turns.map((turn) => turn.profile.baseURL)).toStrictEqual([
    `https://models.example.test/${String(sandboxID)}/worker-direct`,
  ]);
});

test('it leaves the base URL and the gateway alone when the gateway is off', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const turns = ctx.guest.received.flatMap((entry) =>
    entry.frame.type === 'turn' ? [entry.frame] : [],
  );

  expect(turns.map((turn) => turn.profile.baseURL)).toStrictEqual(['https://models.example.test']);
  expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([]);
  expect(ctx.gateway.readSandbox.mock.calls).toStrictEqual([]);
});

test('it fails the run and starts no model request when the gateway refuses the registration', async () => {
  const ctx = await setupTest({ isGatewayOn: true });

  ctx.gateway.putSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('could not start its sandbox'),
  });

  expect(ctx.guest.received.filter((entry) => entry.frame.type === 'turn')).toStrictEqual([]);
});

test('it charges the calling task nothing when the gateway refuses the registration', async () => {
  const ctx = await setupTest({ isGatewayOn: true, limits: { dollars: 0.75 } });

  ctx.gateway.putSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });
  ctx.gateway.readSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(ctx.spent).toStrictEqual([]);
});

test('it states the gateway numbers in the result of an answered run', async () => {
  const ctx = await setupTest({ isGatewayOn: true });

  ctx.gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: { dollars: 0.42, tokens: 7777, tripped: false, lastRefusal: null },
  });

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      workerRunID: expect.toBeString(),
      answer: 'Done.',
      used: { minutes: 0, turns: 0, tokens: 7777, dollars: 0.42 },
    },
  });

  expect(ctx.spent.reduce((sum, value) => sum + value, 0)).toBe(0.42);
});

test('it records the dollars the gateway counted beyond the priced calls of the worker', async () => {
  const ctx = await setupTest({ isGatewayOn: true });

  ctx.gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: { dollars: 0.42, tokens: 7777, tripped: false, lastRefusal: null },
  });

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const records = await ctx.readKinds(['worker.gateway_charged']);

  expect(records.map((record) => record.payload['dollars'])).toStrictEqual([0.42]);
});

test('it sets the ledger rows of a run to the dollars and tokens the gateway counted, in micros', async () => {
  const ctx = await setupTest({ isGatewayOn: true });

  ctx.gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: { dollars: 0.42, tokens: 7777, tripped: false, lastRefusal: null },
  });

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const [ended] = await ctx.readKinds(['worker.run_ended']);

  const counter = `worker_run:${String(ended?.payload['workerRunID'])}`;

  const ledger = await ctx.readLedger();

  expect(ledger).toStrictEqual([
    { counter, unit: 'micros:USD', amount: 420_000 },
    { counter, unit: 'tokens', amount: 7777 },
  ]);
});

test('it charges the calling task the planned dollars when the gateway does not answer the count', async () => {
  const ctx = await setupTest({ isGatewayOn: true, limits: { dollars: 0.75, tokens: 9000 } });

  ctx.gateway.readSandbox.mockResolvedValue({ kind: 'unreachable', reason: 'no answer' });
  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      workerRunID: expect.toBeString(),
      answer: 'Done.',
      used: { minutes: 0, turns: 0, tokens: 9000, dollars: 0.75 },
    },
  });

  expect(ctx.spent.reduce((sum, value) => sum + value, 0)).toBe(0.75);
});

test('it records no gateway charge when the priced calls cover the gateway count', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const records = await ctx.readKinds(['worker.gateway_charged']);

  expect(records).toStrictEqual([]);
});

test('it ends a run at a dollar limit when the gateway found its sandbox past it', async () => {
  const ctx = await setupTest({ isGatewayOn: true, limits: { dollars: 1 } });

  ctx.gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: { dollars: 1.2, tokens: 10, tripped: true, lastRefusal: null },
  });

  ctx.guest.addKindReplies('worker', { text: '', stopReason: 'tool_use' });

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('stopped at its dollars limit of $1.00'),
  });
});

test('it ends a run at a token limit when the gateway found its sandbox past it', async () => {
  const ctx = await setupTest({ isGatewayOn: true, limits: { tokens: 1000 } });

  ctx.gateway.readSandbox.mockResolvedValue({
    kind: 'ok',
    value: { dollars: 0.01, tokens: 1500, tripped: true, lastRefusal: null },
  });

  ctx.guest.addKindReplies('worker', { text: '', stopReason: 'tool_use' });

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('stopped at its tokens limit of 1000'),
  });
});

test('it ends a run at its turns limit when the guest stops at its turn cap', async () => {
  const ctx = await setupTest({ limits: { turns: 3 } });

  ctx.guest.addKindReplies('worker', { text: '', stopReason: 'max_turns' });

  const outcome = await ctx.callWorker({ question: 'Which cafes are open?' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.toInclude('stopped at its turns limit of 3'),
  });
});

test('it runs a call that names a model on the profile of that model, with its grant, prices and record names', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', {
    text: 'Done.',
    usage: {
      uncachedInputTokens: 1000,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
    },
  });

  await ctx.callWorker({ question: 'Which cafes are open?', model: 'big' });

  const [started] = await ctx.readKinds(['worker.run_started']);
  const [created] = await ctx.readKinds(['sandbox.created']);

  expect(started?.payload).toMatchObject({ model: 'claude-test-big', profile: 'big-direct' });

  expect(sandboxCreatedCodec.decode(created?.payload ?? {}).spec.grants[0]?.host).toBe(
    'big.example.test',
  );

  expect(ctx.spent).toStrictEqual([0.03]);

  const turns = ctx.guest.received.flatMap((entry) =>
    entry.frame.type === 'turn' ? [entry.frame] : [],
  );

  expect(turns.map((turn) => turn.profile.model)).toStrictEqual(['claude-test-big']);
});

test('it runs a call that names no model on the profile of the worker role', async () => {
  const ctx = await setupTest();

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?' });

  const [started] = await ctx.readKinds(['worker.run_started']);
  const [created] = await ctx.readKinds(['sandbox.created']);

  expect(started?.payload).toMatchObject({ model: 'claude-test-worker', profile: 'worker-direct' });

  expect(sandboxCreatedCodec.decode(created?.payload ?? {}).spec.grants[0]?.host).toBe(
    'models.example.test',
  );
});

test('it registers a run on a chosen model at the gateway and routes its turn through its profile', async () => {
  const ctx = await setupTest({ isGatewayOn: true });

  ctx.guest.addKindReplies('worker', { text: 'Done.' });

  await ctx.callWorker({ question: 'Which cafes are open?', model: 'big' });

  const [sandboxID] = ctx.gateway.putSandbox.mock.calls[0] ?? [];

  const turns = ctx.guest.received.flatMap((entry) =>
    entry.frame.type === 'turn' ? [entry.frame] : [],
  );

  expect(ctx.gateway.putSandbox.mock.calls).toStrictEqual([
    [expect.toStartWith('nixie-'), { dollars: 1, tokens: 2_000_000 }],
  ]);

  expect(turns.map((turn) => turn.profile.baseURL)).toStrictEqual([
    `https://big.example.test/${String(sandboxID)}/big-direct`,
  ]);
});

test('it refuses a model that is not offered, and starts no sandbox and writes no record', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callWorker({ question: 'Which cafes are open?', model: 'huge' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('There is no model huge'),
  });

  const owners = await ctx.readOwners();
  const records = await ctx.readKinds(['worker.run_started']);

  expect(owners).toStrictEqual([]);
  expect(records).toStrictEqual([]);
});

test('it refuses a model whose entry asks, because no worker runs on it', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.callWorker({ question: 'Which cafes are open?', model: 'careful' });

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'There is no model careful to run a worker on; choose one of big, so nixie started none.',
  });
});
