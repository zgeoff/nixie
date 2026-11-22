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

  const listen = (): void => {
    const server = Bun.listen({
      unix: path,
      socket: {
        open: (socket) => {
          socket.write(new Uint8Array([9, 8, 7]));
        },
        data: (_socket, data) => {
          fromClient.push(new Uint8Array(data));
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
    listen,
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
