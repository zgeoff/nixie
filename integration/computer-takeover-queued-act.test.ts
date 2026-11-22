import { expect, onTestFinished, test } from 'bun:test';
import { startActionRunners } from '@heynixie/actions';
import { createTestStep, queueTestAction } from '@heynixie/actions/test-utils';
import { buildTestClient, createDeviceSession, startTestAPI } from '@heynixie/api/test-utils';
import type { ActionAttempt } from '@heynixie/connectors';
import { makeTakeoverRecords, startComputer } from '@heynixie/connectors';
import { buildStubSandboxAdapter } from '@heynixie/connectors/test-utils';
import { readRecords } from '@heynixie/log';
import { stopWithoutGrace, waitForCondition } from '@heynixie/testing';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const clock = createFakeClock({ startMs: 0 });

  const records = makeTakeoverRecords({
    log: api.context.log,
    definitions: () => api.context.definitions(),
  });

  const startDesktop = () => {
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
      timeZone: 'Pacific/Auckland',
      logger: () => {},
      clock,
      turnWaitMs: 100,
      takeover: { idleMs: 30 * 60 * 1000, records },
    });

    onTestFinished(async () => {
      await computer.stop();
    });

    api.setTakeover(computer.takeover);

    return computer;
  };

  const calls: ActionAttempt[] = [];
  const claims = { reads: 0 };

  return {
    api,
    laptop,
    records,
    startDesktop,
    calls,
    claims,
    client: buildTestClient(api.url, laptop.token),
    startRunner: (isHeld: () => boolean) =>
      startActionRunners(api.context, {
        connectors: new Map([
          [
            'computer.run',
            {
              reconcile: { kind: 'none' as const },
              run: (call: ActionAttempt) => {
                calls.push(call);

                return Promise.resolve({ kind: 'success' as const, result: {} });
              },
            },
          ],
        ]),
        readHeldToolPrefixes: () => {
          claims.reads += 1;

          return isHeld() ? ['computer.'] : [];
        },
        onError: () => {},
      }),
    readKinds: async () => {
      const entries = await readRecords(api.context.log, { afterSequence: 0, limit: 100 });

      return entries.map((entry) => entry.record.kind);
    },
  };
}

test('it keeps a queued act pending through a hold with no attempt, and runs it after the hand-back', async () => {
  const ctx = await setupTest();

  const computer = ctx.startDesktop();

  await ctx.client.computer.takeOver({ clientActionID: crypto.randomUUID() });

  const step = await createTestStep(ctx.api.context);

  await queueTestAction(ctx.api.context, {
    step,
    tool: 'computer.run',
    actionHash: 'sha256:run-1',
    arguments: { command: 'ls' },
    decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
  });

  const runners = ctx.startRunner(() => computer.takeover.isHeld());

  onTestFinished(() => stopWithoutGrace(ctx.api.clock, runners));

  // the runner has read the hold at least once with the act queued
  await waitForCondition(() => ctx.claims.reads > 0);

  const kindsWhileHeld = await ctx.readKinds();

  await ctx.client.computer.handBack({ clientActionID: crypto.randomUUID() });

  await waitForCondition(() => ctx.calls.length === 1);

  const kindsAfter = await ctx.readKinds();

  expect([
    ctx.calls.length,
    kindsWhileHeld.filter((kind) => kind.startsWith('action.')),
    kindsAfter.filter((kind) => kind === 'action.attempt_started'),
  ]).toStrictEqual([1, ['action.queued'], ['action.attempt_started']]);
});
