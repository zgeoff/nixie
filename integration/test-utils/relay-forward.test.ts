import { expect, mock, onTestFinished, test } from 'bun:test';
import { startRelayForward } from './relay-forward';

test('it passes the bytes of a connection to the target port and the reply back', async () => {
  const answerEcho = mock(
    async (incoming: Request) => new Response(`echo:${await incoming.text()}`),
  );

  const target = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerEcho });

  onTestFinished(() => target.stop(true));

  const relay = startRelayForward({
    hostname: '127.0.0.1',
    listenPort: 0,
    targetPort: target.port ?? 0,
  });

  onTestFinished(() => relay.stop());

  const response = await fetch(`http://127.0.0.1:${String(relay.port)}/`, {
    method: 'POST',
    body: 'ping',
  });

  const text = await response.text();

  expect(text).toBe('echo:ping');
});

test('it ends a connection whose target refuses it', async () => {
  const answerEmpty = mock(() => new Response(''));
  const closed = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answerEmpty });
  const refusedPort = closed.port ?? 0;

  await closed.stop(true);

  const relay = startRelayForward({
    hostname: '127.0.0.1',
    listenPort: 0,
    targetPort: refusedPort,
  });

  onTestFinished(() => relay.stop());

  expect(fetch(`http://127.0.0.1:${String(relay.port)}/`)).rejects.toThrow();
});
