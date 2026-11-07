import { expect, test } from 'bun:test';
import { connect } from 'node:tls';
import { startSilentListener } from './start-silent-listener';

test('it records the bytes of a TLS handshake and never answers it', async () => {
  const listener = startSilentListener();
  const socket = connect({ host: '127.0.0.1', port: listener.port });
  const outcome = Promise.withResolvers<string>();

  socket.on('secureConnect', () => {
    outcome.resolve('handshake finished');
  });

  socket.on('error', (error) => {
    outcome.resolve(error.message);
  });

  socket.setTimeout(300, () => {
    outcome.resolve('no answer');
  });

  const answer = await outcome.promise;

  socket.destroy();

  expect(answer).toBe('no answer');
  expect(listener.chunks).not.toStrictEqual([]);
});
