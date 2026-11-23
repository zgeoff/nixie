import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { startStubDesktop } from './start-stub-desktop';

function setupTest() {
  const desktop = startStubDesktop();
  const received: Uint8Array[] = [];

  const socket = new WebSocket(desktop.url);

  socket.binaryType = 'arraybuffer';

  socket.addEventListener('message', (event) => {
    received.push(new Uint8Array(z.instanceof(ArrayBuffer).parse(event.data)));
  });

  onTestFinished(() => {
    socket.close();
  });

  return { socket, received };
}

test('it greets with the 3.8 version, then answers the handshake, and draws one frame', async () => {
  const ctx = setupTest();

  await waitForCondition(() => ctx.received.length === 1);

  ctx.socket.send(new TextEncoder().encode('RFB 003.008\n'));

  await waitForCondition(() => ctx.received.length === 2);

  ctx.socket.send(new Uint8Array([1]));

  await waitForCondition(() => ctx.received.length === 3);

  ctx.socket.send(new Uint8Array([1]));

  await waitForCondition(() => ctx.received.length === 4);

  ctx.socket.send(new Uint8Array([3, 0, 0, 0, 0, 0, 0, 64, 0, 48]));

  await waitForCondition(() => ctx.received.length === 5);

  expect(ctx.received.map((bytes) => bytes.byteLength)).toStrictEqual([
    12,
    2,
    4,
    24 + 12,
    16 + 64 * 48 * 4,
  ]);
});
