import { expect, test } from 'bun:test';
import { connect } from 'node:net';
import { readClosedPort } from './read-closed-port';

test('it returns a loopback port that refuses a connection', async () => {
  const port = readClosedPort();
  const socket = connect({ host: '127.0.0.1', port });
  const refused = Promise.withResolvers<string>();

  socket.on('error', (error: NodeJS.ErrnoException) => {
    refused.resolve(error.code ?? '');
  });

  socket.on('connect', () => {
    socket.destroy();
    refused.resolve('connected');
  });

  const code = await refused.promise;

  expect(code).toBe('ECONNREFUSED');
});
