import { expect, onTestFinished, test } from 'bun:test';
import { startTestAPI } from '@heynixie/api/test-utils';
import {
  buildComputerTools,
  makeHandoverRecords,
  makeTakeoverRecords,
  readOpenHandover,
  startComputer,
} from '@heynixie/connectors';
import { buildStubSandboxAdapter } from '@heynixie/connectors/test-utils';
import { readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { readTestTasks } from '@heynixie/tasks/test-utils';
import { waitForCondition } from '@heynixie/testing';
import type { ToolDefinition } from '@heynixie/tools';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const clock = createFakeClock({ startMs: 1_000_000 });
  const definitions = () => api.context.definitions();

  const adapter = buildStubSandboxAdapter(async (stdin, stdout) => {
    await runComputerGuest(
      { input: stdin, write: (bytes) => stdout.write(bytes) },
      () => Promise.resolve({ kind: 'closed', ok: true }),
      1_000_000,
      { onReady: () => {}, onVNCFrame: () => {} },
    );

    return 0;
  });

  const computer = startComputer({
    adapter,
    image: 'computer-image',
    argv: ['guest'],
    homeEnv: { HOME: '/home/computer' },
    legacyHomeEnv: { HOME: '/home/bun' },
    scans: {
      scan: () => Promise.resolve({ kind: 'pass' as const }),
      scanText: () => Promise.resolve({ kind: 'pass' as const }),
    },
    deniedRanges: [],
    timeZone: 'UTC',
    logger: () => {},
    clock,
    takeover: {
      idleMs: 30 * 60 * 1000,
      records: makeTakeoverRecords({ log: api.context.log, definitions }),
    },
    handover: {
      expiryMs: 60 * 60 * 1000,
      records: makeHandoverRecords({ log: api.context.log, definitions }),
    },
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  const built = buildComputerTools({
    computer,
    log: api.context.log,
    findSecret: () => null,
    isOwnerTyped: () => Promise.resolve(false),
    logger: () => {},
    deniedRanges: [],
    fetch: {
      limits: { bodyBytes: 100, timeoutMs: 1000, redirects: 2, textBytes: 20_000, imageBytes: 100 },
      linkPathChars: 24,
      pageStoreBytes: 20_971_520,
      imageLongEdge: 1568,
      secretTypedURLCovers: 'redirects',
    },
  });

  const toolContext = {
    callSequence: 1,
    run: {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: [],
      model: { model: 'model-a', profile: 'chat-direct' },
      session: { key: 'session-a', invalidatedThrough: 0 },
    },
  };

  return {
    clock,
    computer,
    readInbox: async () => {
      const tasks = await readTestTasks(api.writer);

      return tasks.find((task) => task.id === 'conversation')?.lastInboxSequence ?? null;
    },
    readOpenAsk: () => readOpenHandover(api.context.log),
    call: (name: string, input: Record<string, string> = {}) => {
      const tool = built.tools.find(
        (candidate): candidate is ToolDefinition => candidate.name === name,
      );

      invariant(tool, `no tool ${name}`);

      return tool.run({ callID: 'call-1', tool: name, input, toolUseID: null }, toolContext);
    },
    readPayloads: async (kind: string) => {
      const entries = await readRecords(api.context.log, { afterSequence: 0, limit: 50 });

      return entries
        .filter((entry) => entry.record.kind === kind)
        .map((entry) => entry.record.payload);
    },
  };
}

test('it wakes the conversation when an ask expires, and not when it is asked', async () => {
  const ctx = await setupTest();
  const before = await ctx.readInbox();

  await ctx.computer.handover.ask('a CAPTCHA');

  const afterAsk = await ctx.readInbox();

  ctx.clock.advance(60 * 60 * 1000);

  await waitForCondition(async () => {
    const closed = await ctx.readPayloads('computer.handover_closed');

    return closed.length === 1;
  });

  const afterExpiry = await ctx.readInbox();
  const closed = await ctx.readPayloads('computer.handover_closed');

  expect([afterAsk === before, afterExpiry !== null && afterExpiry !== afterAsk]).toStrictEqual([
    true,
    true,
  ]);

  expect(closed).toMatchObject([{ by: 'expired' }]);
});

test('it wakes nothing when the assistant cancels its ask', async () => {
  const ctx = await setupTest();

  await ctx.computer.handover.ask('a CAPTCHA');

  const afterAsk = await ctx.readInbox();

  await ctx.computer.handover.cancel();

  const afterCancel = await ctx.readInbox();
  const closed = await ctx.readPayloads('computer.handover_closed');

  expect([afterCancel, closed]).toMatchObject([afterAsk, [{ by: 'assistant' }]]);
});

test('it clears the ask the client reads when the assistant cancels it with its tool', async () => {
  const ctx = await setupTest();

  await ctx.call('computer.handover', { reason: 'a CAPTCHA' });

  const whileOpen = await ctx.readOpenAsk();

  await ctx.call('computer.handover_cancel');

  const afterCancel = await ctx.readOpenAsk();
  const closed = await ctx.readPayloads('computer.handover_closed');

  expect([whileOpen?.reason, afterCancel, closed]).toMatchObject([
    'a CAPTCHA',
    null,
    [{ by: 'assistant' }],
  ]);
});

test('it clears the ask the client reads when the ask expires on the clock', async () => {
  const ctx = await setupTest();

  await ctx.call('computer.handover', { reason: 'a CAPTCHA' });

  ctx.clock.advance(60 * 60 * 1000);

  await waitForCondition(async () => (await ctx.readOpenAsk()) === null);

  const closed = await ctx.readPayloads('computer.handover_closed');

  expect(closed).toMatchObject([{ by: 'expired' }]);
});

test('it writes the end of a hold as the assistant when its take_back tool runs', async () => {
  const ctx = await setupTest();

  await ctx.computer.takeover.start('laptop');
  await ctx.call('computer.take_back');

  const ended = await ctx.readPayloads('computer.takeover_ended');

  expect(ended).toMatchObject([{ by: 'assistant' }]);
});

test('it reads no open ask once a take-over answers it', async () => {
  const ctx = await setupTest();

  await ctx.call('computer.handover', { reason: 'a CAPTCHA' });
  await ctx.computer.takeover.start('laptop');

  const open = await ctx.readOpenAsk();

  expect(open).toBeNull();
});
