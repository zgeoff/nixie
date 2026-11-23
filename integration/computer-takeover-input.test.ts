import { expect, onTestFinished, test } from 'bun:test';
import { buildTestClient, createDeviceSession, startTestAPI } from '@heynixie/api/test-utils';
import { startComputer } from '@heynixie/connectors';
import { buildStubSandboxAdapter } from '@heynixie/connectors/test-utils';
import { sessionCookieName } from '@heynixie/contract';
import { nativeWebSocket, waitForCondition } from '@heynixie/testing';
import type { VNCFrame } from '@heynixie/wire';
import { runComputerGuest } from '@heynixie/wire';
import { createFakeClock } from '@zgeoff/testing/clock';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');
  const phone = await createDeviceSession(api.context, 'phone');

  const frames: VNCFrame[] = [];

  const adapter = buildStubSandboxAdapter(async (stdin, stdout) => {
    await runComputerGuest(
      { input: stdin, write: (bytes) => stdout.write(bytes) },
      () => Promise.resolve({ kind: 'closed', ok: true }),
      1_000_000,
      {
        onReady: () => {},
        onVNCFrame: (frame, send) => {
          frames.push(frame);

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
    clock: createFakeClock({ startMs: 0 }),
    turnWaitMs: 100,
  });

  onTestFinished(async () => {
    await computer.stop();
  });

  api.setWatch(computer.watch);
  api.setTakeover(computer.takeover);

  const NativeWebSocket = nativeWebSocket;

  return {
    api,
    computer,
    laptop,
    phone,
    frames,
    openWatch: async (token: string) => {
      const minted = await buildTestClient(api.url, token).computer.watch({
        clientActionID: crypto.randomUUID(),
      });

      const opened = Promise.withResolvers<void>();

      const socket = new NativeWebSocket(
        `ws://127.0.0.1:${new URL(api.url).port}${minted.streamURL}`,
        { headers: { cookie: `${sessionCookieName}=${token}` } },
      );

      socket.binaryType = 'arraybuffer';

      socket.addEventListener('message', () => {
        opened.resolve();
      });

      onTestFinished(() => {
        socket.close();
      });

      await opened.promise;

      const version = new TextEncoder().encode('RFB 003.008\n');

      socket.send(version);
      socket.send(new Uint8Array([1]));
      socket.send(new Uint8Array([1]));

      // A whole-screen update request always passes, so once the guest has seen the marker of one,
      // it has seen every message the viewer sent before it.
      return {
        sendPointer: () => {
          socket.send(new Uint8Array([5, 0, 0, 10, 0, 10]));
        },
        sendMarker: (marker: number) => {
          socket.send(new Uint8Array([3, 0, 0, marker, 0, 0, 0, 1, 0, 1]));
        },
      };
    },
    waitForMarker: (marker: number) =>
      waitForCondition(() =>
        frames.some(
          (frame) =>
            frame.kind === 'vnc-data' && frame.data.length === 10 && frame.data[3] === marker,
        ),
      ),
    countPointerFrames: () =>
      frames.filter(
        (frame) => frame.kind === 'vnc-data' && frame.data.length === 6 && frame.data[0] === 5,
      ).length,
  };
}

test('it drops the pointer of a viewer until its device takes over, and passes it after', async () => {
  const ctx = await setupTest();
  const watch = await ctx.openWatch(ctx.laptop.token);

  watch.sendPointer();
  watch.sendMarker(1);

  await ctx.waitForMarker(1);

  const before = ctx.countPointerFrames();

  await buildTestClient(ctx.api.url, ctx.laptop.token).computer.takeOver({
    clientActionID: crypto.randomUUID(),
  });

  watch.sendPointer();

  await waitForCondition(() => ctx.countPointerFrames() === 1);

  expect([before, ctx.countPointerFrames(), ctx.computer.takeover.isHeld()]).toStrictEqual([
    0,
    1,
    true,
  ]);
});

test('it drops the pointer of a second device while the first holds the desktop', async () => {
  const ctx = await setupTest();
  const watch = await ctx.openWatch(ctx.phone.token);

  const owner = buildTestClient(ctx.api.url, ctx.laptop.token);

  await owner.computer.takeOver({ clientActionID: crypto.randomUUID() });

  const refused = buildTestClient(ctx.api.url, ctx.phone.token).computer.takeOver({
    clientActionID: crypto.randomUUID(),
  });

  await Promise.allSettled([refused]);

  watch.sendPointer();
  watch.sendMarker(1);

  await ctx.waitForMarker(1);

  expect(refused).rejects.toMatchObject({ code: 'HELD_ELSEWHERE' });
  expect(ctx.countPointerFrames()).toBe(0);
});

test('it stops passing pointer messages once the device hands the desktop back', async () => {
  const ctx = await setupTest();
  const watch = await ctx.openWatch(ctx.laptop.token);

  const client = buildTestClient(ctx.api.url, ctx.laptop.token);

  await client.computer.takeOver({ clientActionID: crypto.randomUUID() });

  watch.sendPointer();

  await waitForCondition(() => ctx.countPointerFrames() === 1);

  await client.computer.handBack({ clientActionID: crypto.randomUUID() });

  // the hand-back ends the holder's streams, so the page watches again with a stream of its own
  const watchAgain = await ctx.openWatch(ctx.laptop.token);

  watchAgain.sendPointer();
  watchAgain.sendMarker(2);

  await ctx.waitForMarker(2);

  expect([ctx.countPointerFrames(), ctx.computer.takeover.isHeld()]).toStrictEqual([1, false]);
});
