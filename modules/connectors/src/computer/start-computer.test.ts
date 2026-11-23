import { expect, onTestFinished, test } from 'bun:test';
import { runComputerGuest } from '@heynixie/wire';
import { waitFor } from '@zgeoff/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildStubSandboxAdapter } from '../test-utils/build-stub-sandbox-adapter';
import { startComputer } from './start-computer';

function setupTest() {
  const clock = createFakeClock({ startMs: 1_000_000 });
  const closes: string[] = [];
  const startedWrite = Promise.withResolvers<void>();
  const startedWriteEntered = Promise.withResolvers<void>();

  const adapter = buildStubSandboxAdapter(async (stdin, stdout) => {
    await runComputerGuest(
      { input: stdin, write: (bytes) => stdout.write(bytes) },
      () =>
        Promise.resolve({
          kind: 'page' as const,
          ok: true as const,
          tab: 'g1',
          isDiskNew: false,
          hasChallenge: false,
          page: { url: 'https://site.test/', status: 200, title: 'A', text: 'a', links: [] },
        }),
      10_000_000,
    );

    return 0;
  });

  const computer = startComputer({
    adapter,
    image: 'computer-image',
    argv: ['guest'],
    scans: {
      scan: () => Promise.resolve({ kind: 'pass' as const }),
      scanText: () => Promise.resolve({ kind: 'pass' as const }),
    },
    deniedRanges: [],
    timeZone: 'UTC',
    logger: () => {},
    clock,
    takeover: {
      idleMs: 60 * 60 * 1000,
      records: {
        writeStarted: () => {
          startedWriteEntered.resolve();

          return startedWrite.promise;
        },
        writeEnded: () => Promise.resolve(),
      },
    },
    handover: {
      expiryMs: 60 * 60 * 1000,
      records: {
        writeAsked: () => Promise.resolve(),
        writeClosed: (input) => {
          closes.push(input.by);

          return Promise.resolve();
        },
      },
    },
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  return {
    clock,
    closes,
    computer,
    waitForStartedWrite: () => startedWriteEntered.promise,
    finishStartedWrite: () => startedWrite.resolve(),
  };
}

test('it writes no expiry for an ask that a take-over answers while its start record is still being written', async () => {
  const ctx = setupTest();

  await ctx.computer.handover.ask('a CAPTCHA');

  const started = ctx.computer.takeover.start('laptop');

  await ctx.waitForStartedWrite();

  ctx.clock.advance(60 * 60 * 1000 + 1000);

  await waitFor(() => ctx.clock.readNextDueMs() !== null);

  ctx.finishStartedWrite();

  await started;

  ctx.clock.advance(60 * 60 * 1000);

  const cancelled = await ctx.computer.handover.cancel();

  expect([ctx.closes, cancelled]).toStrictEqual([[], { kind: 'not_asked' }]);
});
