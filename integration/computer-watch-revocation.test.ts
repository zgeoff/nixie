import { expect, onTestFinished, test } from 'bun:test';
import { buildTestClient, createDeviceSession, startTestAPI } from '@heynixie/api/test-utils';
import { startComputer } from '@heynixie/connectors';
import { buildStubSandboxAdapter } from '@heynixie/connectors/test-utils';
import { sessionCookieName } from '@heynixie/contract';
import type { Sandbox } from '@heynixie/sandbox';
import { nativeWebSocket, waitForCondition } from '@heynixie/testing';
import type { VNCFrame } from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';
import { z } from 'zod';

interface SetupOptions {
  // holds each wake of the sandbox until the promise settles
  readonly wakeGate?: Promise<void>;
}

async function setupTest(options: SetupOptions = {}) {
  const api = await startTestAPI();
  const owner = await createDeviceSession(api.context, 'laptop');
  const viewer = await createDeviceSession(api.context, 'phone');

  const clock = createFakeClock({ startMs: 0 });
  const state = { sleeps: 0, wakes: 0 };

  const vnc: { frames: VNCFrame[]; send: ((frame: VNCFrame) => Promise<void>) | null } = {
    frames: [],
    send: null,
  };

  const stub = buildStubSandboxAdapter(async (stdin, stdout) => {
    await runComputerGuest(
      { input: stdin, write: (bytes) => stdout.write(bytes) },
      () => Promise.resolve({ kind: 'closed', ok: true }),
      1_000_000,
      {
        onReady: () => {},
        onVNCFrame: (frame, send) => {
          vnc.frames.push(frame);

          vnc.send = send;

          if (frame.kind === 'vnc-open') {
            void send({
              kind: 'vnc-data',
              stream: frame.stream,
              data: new TextEncoder().encode('RFB 003.008\n'),
            });
          }
        },
      },
    );

    return 0;
  });

  const adapter = {
    ...stub,
    create: async (spec: Parameters<typeof stub.create>[0]) => {
      const sandbox = await stub.create(spec);

      return {
        ...sandbox,
        suspension: {
          kind: 'memory' as const,
          sleep: () => {
            state.sleeps += 1;

            return Promise.resolve();
          },
          wake: async () => {
            state.wakes += 1;

            await options.wakeGate;
          },
        },
      } satisfies Sandbox;
    },
  };

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
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  api.setWatch(computer.watch);

  const NativeWebSocket = nativeWebSocket;

  return {
    api,
    computer,
    clock,
    state,
    vnc,
    wakeSleepingSandbox: async () => {
      await computer.call({
        request: { op: 'run', argv: ['true'], timeoutSeconds: 5 },
        scan: () => Promise.resolve({ kind: 'pass' as const }),
        scanText: () => Promise.resolve({ kind: 'pass' as const }),
        timeoutMs: 5000,
      });

      clock.advance(30 * 60 * 1000);

      await waitForCondition(() => state.sleeps === 1);
    },
    watchAs: async (token: string) => {
      const minted = await buildTestClient(api.url, token).computer.watch({
        clientActionID: crypto.randomUUID(),
      });

      const messages: Uint8Array[] = [];
      const closed = Promise.withResolvers<{ code: number }>();

      const socket = new NativeWebSocket(
        `ws://127.0.0.1:${new URL(api.url).port}${minted.streamURL}`,
        { headers: { cookie: `${sessionCookieName}=${token}` } },
      );

      socket.binaryType = 'arraybuffer';

      socket.addEventListener('message', (event) => {
        messages.push(new Uint8Array(z.instanceof(ArrayBuffer).parse(event.data)));
      });

      socket.addEventListener('close', (event) => {
        closed.resolve({ code: event.code });
      });

      onTestFinished(() => {
        socket.close();
      });

      return { messages, closed: closed.promise };
    },
    revoke: () =>
      buildTestClient(api.url, owner.token).sessions.revoke({
        clientActionID: crypto.randomUUID(),
        sessionID: viewer.sessionID,
      }),
    viewer,
  };
}

test('it ends a watch that waits on the sandbox wake when its session is revoked', async () => {
  const gate = Promise.withResolvers<void>();

  const ctx = await setupTest({ wakeGate: gate.promise });

  await ctx.wakeSleepingSandbox();

  const browser = await ctx.watchAs(ctx.viewer.token);

  await waitForCondition(() => ctx.state.wakes === 1);

  await ctx.revoke();

  const closed = await browser.closed;

  gate.resolve();

  await waitForCondition(() => {
    ctx.clock.advance(30 * 60 * 1000);

    return ctx.state.sleeps === 2;
  });

  expect([closed.code, ctx.vnc.frames, ctx.computer.isWatched()]).toStrictEqual([1008, [], false]);
});

test('it ends a streaming watch when its session is revoked, and stops its frames', async () => {
  const ctx = await setupTest();
  const browser = await ctx.watchAs(ctx.viewer.token);

  await waitForCondition(() => browser.messages.length === 1);

  await ctx.revoke();

  const closed = await browser.closed;

  await waitForCondition(() => ctx.vnc.frames.some((frame) => frame.kind === 'vnc-close'));

  const open = ctx.vnc.frames.find((frame) => frame.kind === 'vnc-open');

  await ctx.vnc.send?.({
    kind: 'vnc-data',
    stream: open?.stream ?? '',
    data: new Uint8Array([1, 2, 3]),
  });

  ctx.clock.advance(30 * 60 * 1000);

  await waitForCondition(() => ctx.state.sleeps === 1);

  expect([closed.code, browser.messages.length, ctx.computer.isWatched()]).toStrictEqual([
    1008,
    1,
    false,
  ]);
});
