import { expect, mock, onTestFinished, test } from 'bun:test';

test('it lets a loopback WebSocket through to its server with the headers it was opened with', async () => {
  const upgradeRequest = mock((request: Request, server: Bun.Server<undefined>) =>
    server.upgrade(request) ? undefined : new Response('no upgrade', { status: 400 }),
  );

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: upgradeRequest,
    websocket: {
      message: (socket, message) => {
        socket.send(`echo ${String(message)}`);
      },
    },
  });

  onTestFinished(() => server.stop(true));

  const socket = new WebSocket(`ws://127.0.0.1:${String(server.port)}/tide`, {
    headers: { authorization: 'Bearer tide-token' },
  });

  onTestFinished(() => {
    socket.close();
  });

  const reply = Promise.withResolvers<string>();

  socket.addEventListener('open', () => {
    socket.send('high water');
  });

  socket.addEventListener('message', (event) => {
    reply.resolve(String(event.data));
  });

  const text = await reply.promise;

  expect(text).toBe('echo high water');
  expect(upgradeRequest.mock.calls[0]?.[0].headers.get('authorization')).toBe('Bearer tide-token');
});
