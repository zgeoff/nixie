import { expect, onTestFinished, test } from 'bun:test';
import { startStubListener } from './start-stub-listener';

test('it ends a connection once the connection sends data', async () => {
  const listener = startStubListener('127.0.0.1');
  const closed = Promise.withResolvers<void>();

  const socket = await Bun.connect({
    hostname: '127.0.0.1',
    port: listener.port,
    socket: {
      data: () => {},
      close: () => {
        closed.resolve();
      },
    },
  });

  onTestFinished(() => {
    socket.end();
  });

  socket.write('ping');

  await expect(closed.promise).toResolve();
});

test('it stops the listener when the test finishes', () => {
  const listener = startStubListener('127.0.0.1');
  const port = listener.port;

  onTestFinished(() => {
    expect(
      Bun.connect({ hostname: '127.0.0.1', port, socket: { data: () => {} } }),
    ).rejects.toThrow();
  });
});
