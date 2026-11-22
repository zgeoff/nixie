import { expect, onTestFinished, test } from 'bun:test';
import { connectVNC } from './connect-vnc';

async function setupTest() {
  const fromClient: Uint8Array[] = [];
  const clientClosed = Promise.withResolvers<void>();

  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
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

  const received: Uint8Array[] = [];
  const closed = Promise.withResolvers<void>();
  const gotData = Promise.withResolvers<void>();

  const link = await connectVNC(server.port, {
    onData: (bytes) => {
      received.push(bytes);
      gotData.resolve();
    },
    onClose: () => {
      closed.resolve();
    },
  });

  return {
    link,
    received,
    fromClient,
    gotData: gotData.promise,
    clientClosed: clientClosed.promise,
  };
}

test('it reads what the VNC server sends', async () => {
  const ctx = await setupTest();

  await ctx.gotData;

  expect(ctx.received).toStrictEqual([new Uint8Array([9, 8, 7])]);
});

test('it writes to the VNC server and closes the connection on end', async () => {
  const ctx = await setupTest();

  ctx.link.write(new Uint8Array([1, 2, 3]));
  ctx.link.end();

  await ctx.clientClosed;

  expect(ctx.fromClient).toStrictEqual([new Uint8Array([1, 2, 3])]);
});
