import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHostResponder } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import { sendHostRequest } from './send-host-request';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const api = await startTestAPI();

  return { path: join(directory, 'control.sock'), api };
}

test('it returns the answer of the procedure it calls on the running server', async () => {
  const ctx = await setupTest();

  const socket = await startControlSocket({
    path: ctx.path,
    respond: makeHostResponder({
      context: ctx.api.context,
      readMemory: () => null,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: () =>
        Promise.resolve({
          resetAt: new Date('2026-10-14T09:30:00.000Z'),
          lastSequence: 412,
          keptSessions: 2,
        }),
    }),
  });

  onTestFinished(() => socket.stop());

  const reset = await sendHostRequest(ctx.path, 'reset', (client) => client.reset());

  expect(reset).toStrictEqual({
    resetAt: new Date('2026-10-14T09:30:00.000Z'),
    lastSequence: 412,
    keptSessions: 2,
  });
});

test('it rejects with the status and the reason when the server refuses the request', async () => {
  const ctx = await setupTest();

  const socket = await startControlSocket({
    path: ctx.path,
    respond: makeHostResponder({
      context: ctx.api.context,
      readMemory: () => null,
      seedWrittenSkills: () => Promise.resolve(),
      runReset: mock(),
    }),
  });

  onTestFinished(() => socket.stop());

  const labelled = sendHostRequest(ctx.path, 'session label', (client) =>
    client.sessions.label({ sessionID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f', label: 'work' }),
  );

  await labelled.catch(() => {});

  expect(labelled).rejects.toThrowWithMessage(
    Error,
    'nixie answered the session label request with 404: no device session that is still signed in has that ID',
  );
});

test('it rejects when no server listens on the socket', async () => {
  const ctx = await setupTest();

  const reset = sendHostRequest(ctx.path, 'reset', (client) => client.reset());

  await reset.catch(() => {});

  expect(reset).rejects.toThrow();
});
