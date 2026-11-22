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

  onTestFinished(() => {
    relay.stop();
  });

  const response = await fetch(`http://127.0.0.1:${String(relay.port)}/`, {
    method: 'POST',
    body: 'ping',
  });

  const text = await response.text();

  expect(text).toBe('echo:ping');
});

test('it ends a connection whose target refuses it', async () => {
  // Port 1 is below the range the system hands out for port 0, so no other test's server can take
  // it, and nothing listens on it. A port that a test frees can go to another test's server in the
  // same run, which then answers the relay instead of refusing it.
  const relay = startRelayForward({ hostname: '127.0.0.1', listenPort: 0, targetPort: 1 });

  onTestFinished(() => {
    relay.stop();
  });

  await expect(fetch(`http://127.0.0.1:${String(relay.port)}/`)).rejects.toThrow();
});
