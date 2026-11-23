import { expect, onTestFinished, test } from 'bun:test';
import { startTestAPI } from '@heynixie/api/test-utils';
import { makeHandoverRecords, makeTakeoverRecords, startComputer } from '@heynixie/connectors';
import { buildStubSandboxAdapter } from '@heynixie/connectors/test-utils';
import { readRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { waitForCondition } from '@heynixie/testing';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import { sql } from 'kysely';
import { z } from 'zod';

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

  return {
    clock,
    computer,
    readInbox: async () => {
      const result = await sql`
        select last_inbox_sequence from tasks where task_id = 'conversation'
      `.execute(api.writer.db);

      const [row] = z
        .array(z.object({ last_inbox_sequence: z.number().nullable() }))
        .parse(result.rows);

      return row?.last_inbox_sequence ?? null;
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

test('it writes the end of a hold as the assistant when it takes the computer back', async () => {
  const ctx = await setupTest();

  await ctx.computer.takeover.start('laptop');
  await ctx.computer.takeover.end('assistant');

  const ended = await ctx.readPayloads('computer.takeover_ended');

  expect(ended).toMatchObject([{ by: 'assistant' }]);
});
