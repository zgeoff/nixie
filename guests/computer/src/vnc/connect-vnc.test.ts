import { expect, onTestFinished, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connectVNC } from './connect-vnc';

function setupTest() {
  const fromClient: Uint8Array[] = [];
  const clientClosed = Promise.withResolvers<void>();

  // a socket path that nothing listens on until the test starts the server
  const folder = mkdtempSync(join(tmpdir(), 'nixie-vnc-'));
  const path = join(folder, 'vnc.sock');

  onTestFinished(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  const held: { socket: Bun.Socket | null } = { socket: null };
  const wanted = { bytes: 0, reached: Promise.withResolvers<void>() };
  const readByteCount = (): number => fromClient.reduce((sum, chunk) => sum + chunk.byteLength, 0);

  // The server stops reading when it opens, so what the guest writes backs up until the test reads.
  const listen = (options: { readonly isPaused?: boolean } = {}): void => {
    const server = Bun.listen({
      unix: path,
      socket: {
        open: (socket) => {
          socket.write(new Uint8Array([9, 8, 7]));

          held.socket = socket;

          if (options.isPaused === true) {
            socket.pause();
          }
        },
        data: (_socket, data) => {
          fromClient.push(new Uint8Array(data));

          if (wanted.bytes > 0 && readByteCount() >= wanted.bytes) {
            wanted.reached.resolve();
          }
        },
        close: () => {
          clientClosed.resolve();
        },
      },
    });

    onTestFinished(() => {
      server.stop(true);
    });
  };

  const received: Uint8Array[] = [];
  const gotData = Promise.withResolvers<void>();

  const connect = (waitMs: number) =>
    connectVNC(
      { path, waitMs },
      {
        onData: (bytes) => {
          received.push(bytes);
          gotData.resolve();
        },
        onClose: () => {},
      },
    );

  return {
    // more than a socket takes at once, so what follows it backs up
    bigMessage: new Uint8Array(16 * 1024 * 1024),
    listen,
    readBytes: () => Buffer.concat(fromClient),

    // resolves once the server has read that many bytes, and the server reads on from there
    readUntil: (byteCount: number) => {
      wanted.bytes = byteCount;
      held.socket?.resume();

      return wanted.reached.promise;
    },
    connect,
    received,
    fromClient,
    gotData: gotData.promise,
    clientClosed: clientClosed.promise,
  };
}

test('it reads what the VNC server sends', async () => {
  const ctx = setupTest();

  ctx.listen();

  await ctx.connect(0);

  await ctx.gotData;

  expect(ctx.received).toStrictEqual([new Uint8Array([9, 8, 7])]);
});

test('it writes to the VNC server and closes the connection on end', async () => {
  const ctx = setupTest();

  ctx.listen();

  const link = await ctx.connect(0);

  link.write(new Uint8Array([1, 2, 3]));
  link.end();

  await ctx.clientClosed;

  expect(ctx.fromClient).toStrictEqual([new Uint8Array([1, 2, 3])]);
});

test('it connects to a VNC server that starts listening after the first try is refused', async () => {
  const ctx = setupTest();

  setTimeout(ctx.listen, 300);

  await ctx.connect(5000);

  await ctx.gotData;

  expect(ctx.received).toStrictEqual([new Uint8Array([9, 8, 7])]);
});

test('it rejects when the VNC server still refuses once the wait has passed', () => {
  const ctx = setupTest();

  expect(ctx.connect(300)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('it drops the messages the server has not taken when it flushes', async () => {
  const ctx = setupTest();

  ctx.listen();

  const link = await ctx.connect(0);

  link.flush();
  link.write(new Uint8Array([4]));
  link.end();

  await ctx.clientClosed;

  expect(ctx.fromClient).toStrictEqual([new Uint8Array([4])]);
});

test('it keeps a protocol message that backs up behind the socket when it flushes, and drops the input', async () => {
  const ctx = setupTest();

  ctx.listen({ isPaused: true });

  const link = await ctx.connect(0);

  const version = new TextEncoder().encode('RFB 003.008\n');

  link.write(ctx.bigMessage);
  link.write(version);
  link.write(new Uint8Array([4, 1, 0, 0, 0, 0, 0, 65]));
  link.flush();

  await ctx.readUntil(ctx.bigMessage.byteLength + 12);

  expect(ctx.readBytes().subarray(ctx.bigMessage.byteLength)).toStrictEqual(Buffer.from(version));
});

test('it releases a key that went down when its key-up is dropped in the backlog', async () => {
  const ctx = setupTest();

  ctx.listen({ isPaused: true });

  const link = await ctx.connect(0);

  link.write(new Uint8Array([4, 1, 0, 0, 0, 0, 0, 65]));
  link.write(ctx.bigMessage);
  link.write(new Uint8Array([4, 0, 0, 0, 0, 0, 0, 65]));
  link.flush();

  await ctx.readUntil(8 + ctx.bigMessage.byteLength + 8);

  const received = ctx.readBytes();

  expect([received.subarray(0, 8), received.subarray(received.byteLength - 8)]).toStrictEqual([
    Buffer.from(new Uint8Array([4, 1, 0, 0, 0, 0, 0, 65])),
    Buffer.from(new Uint8Array([4, 0, 0, 0, 0, 0, 0, 65])),
  ]);
});

test('it sends the releases that wait behind the socket before it closes on end', async () => {
  const ctx = setupTest();

  ctx.listen({ isPaused: true });

  const link = await ctx.connect(0);

  link.write(new Uint8Array([4, 1, 0, 0, 0, 0, 0, 65]));
  link.write(ctx.bigMessage);
  link.write(new Uint8Array([4, 0, 0, 0, 0, 0, 0, 65]));
  link.flush();
  link.end();

  await ctx.readUntil(8 + ctx.bigMessage.byteLength + 8);

  await ctx.clientClosed;

  const received = ctx.readBytes();

  expect(received.subarray(received.byteLength - 8)).toStrictEqual(
    Buffer.from(new Uint8Array([4, 0, 0, 0, 0, 0, 0, 65])),
  );
});
