import { expect, onTestFinished, test } from 'bun:test';
import { askProxy } from './ask-proxy';

test('it returns what a server writes before it closes', async () => {
  const server = Bun.listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      data: (socket, data) => {
        socket.end(`echo ${data.toString()}`);
      },
    },
  });

  onTestFinished(() => {
    server.stop(true);
  });

  const reply = await askProxy(server.port, 'hi');

  expect(reply).toBe('echo hi');
});
