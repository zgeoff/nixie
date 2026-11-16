import { expect, test } from 'bun:test';
import type { JSONObject, RecordKinds } from '@heynixie/log';
import { readRecords, writeRecords } from '@heynixie/log';
import { modelsConfigSchema } from '@heynixie/models';
import { sandboxCreatedCodec } from '@heynixie/sandbox';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import type { ToolOutcome, ToolStepHold } from '@heynixie/tools';
import { buildMockToolContext, buildMockToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { startTestSessionHost } from '../test-utils/start-test-session-host';
import { startWorkerTool } from './start-worker-tool';

interface SetupConfig {
  // the first sandbox's first destroy fails
  readonly isFirstDestroyFailing?: boolean;

  readonly limits?: Readonly<Record<string, number>>;
  readonly workerRuns?: { readonly max: number; readonly whenFull: 'wait' | 'error' };
}

async function setupTest(config: SetupConfig = {}) {
  const clock = buildTestClock(1_000_000);

  const fetchTool = buildMockToolDefinition({
    name: 'notes_read',
    run: () => Promise.resolve({ status: 'ok', result: { text: 'Found 3 cafes.' } }),
  });

  const host = await startTestSessionHost({ clock, tools: [fetchTool] });

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
    },
    roles: { conversation: 'chat-direct', worker: 'worker-direct' },
    limits: { workerRun: config.limits ?? {} },
  });

  const destroys: string[] = [];
  const state = { isCreated: false };

  const sandboxes: typeof host.sandboxes = {
    ...host.sandboxes,
    create: async (spec) => {
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

          await sandbox.destroy();
        },
      };
    },
  };

  const worker = await startWorkerTool({
    models,
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes,
    images: { conversation: 'nixie-conversation-0123456789ab' },
    log: host.context.log,
    definitions: host.context.definitions,
    clock,
    logger: () => {},
    readTools: () => host.endpoint,
    ...(config.workerRuns === undefined ? {} : { workerRuns: config.workerRuns }),
  });

  host.defer(() => worker.stop());

  const tool = worker.buildTool({
    memoryTools: { read: ['memory.recall'], write: ['memory.remember'] },
    conversationTools: ['log.forget'],
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

  const spent: number[] = [];

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
    overrides: { readonly hold?: Partial<ToolStepHold>; readonly tools?: readonly string[] } = {},
  ): Promise<ToolOutcome> =>
    tool.run(
      { callID: crypto.randomUUID(), tool: 'worker.run', input, toolUseID: null },
      buildMockToolContext({
        callSequence: parent.record.sequence,
        run: {
          thread: 'task-1',
          logThread: 'task-1',
          tools: overrides.tools ?? ['notes_read'],
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
    clock,
    spent,
    destroys,
    caller,
    interrupt,
    callWorker,
    stop: () => worker.stop(),
    readKinds: async (kinds: readonly (keyof RecordKinds)[]) => {
      const entries = await readRecords(host.context.log, { afterSequence: 0, kinds: [...kinds] });

      return entries.map((entry) => entry.record);
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

  expect(first).rejects.toThrowWithMessage(Error, 'the step ended');
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
