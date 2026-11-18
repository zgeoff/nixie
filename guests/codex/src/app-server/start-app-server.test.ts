import { expect, test } from 'bun:test';
import { startFakeAppServer } from '../test-utils/start-fake-app-server';
import { startAppServer } from './start-app-server';

test('it reports a close with the exit status when the process exits after its output ends', async () => {
  const server = startFakeAppServer(() => ({}));

  const client = await startAppServer(server.process, null);

  server.close(3);

  const event = await client.nextEvent();

  expect(event).toStrictEqual({
    kind: 'closed',
    detail: 'codex app-server exited with status 3',
  });
});

test('it reports a close when the output ends and the process keeps running', async () => {
  const server = startFakeAppServer(() => ({}));

  const client = await startAppServer(
    { ...server.process, exited: new Promise<number>(() => {}) },
    null,
  );

  server.close(0);

  const event = await client.nextEvent();

  expect(event).toStrictEqual({
    kind: 'closed',
    detail: 'codex app-server closed its output and kept running',
  });
});

test('it rejects a pending request when the output ends and the process keeps running', async () => {
  const server = startFakeAppServer(() => ({}));
  const state = { isMuted: false };

  const client = await startAppServer(
    {
      ...server.process,
      stdin: {
        write: (text) => (state.isMuted ? undefined : server.process.stdin.write(text)),
        end: () => {},
      },
      exited: new Promise<number>(() => {}),
    },
    null,
  );

  state.isMuted = true;

  const pending = client.request('thread/start', {});

  server.close(0);

  expect(pending).rejects.toThrowWithMessage(
    Error,
    'codex app-server closed its output and kept running',
  );
});
