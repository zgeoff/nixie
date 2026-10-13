import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendSessionRequest } from './send-session-request';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'control.sock') };
}

test('it returns the sessions the running server lists', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readProposals: () => null,
    readSessions: () =>
      Promise.resolve([
        {
          sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
          deviceName: 'Browser',
          createdAt: new Date('2026-10-01T09:00:00.000Z'),
          lastUsedAt: new Date('2026-10-13T08:30:00.000Z'),
        },
      ]),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const sessions = await sendSessionRequest(ctx.path, { command: 'list' });

  expect(sessions).toStrictEqual([
    {
      sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
      deviceName: 'Browser',
      createdAt: '2026-10-01T09:00:00.000Z',
      lastUsedAt: '2026-10-13T08:30:00.000Z',
    },
  ]);
});

test('it returns the label the running server set', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readProposals: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () =>
      Promise.resolve({
        status: 'labelled' as const,
        sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
        label: 'phone',
      }),
  });

  onTestFinished(() => socket.stop());

  const labelled = await sendSessionRequest(ctx.path, {
    command: 'label',
    sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
    label: 'phone',
  });

  expect(labelled).toStrictEqual({
    sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
    label: 'phone',
  });
});

test('it rejects with the status and the reason when the server refuses the label', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readProposals: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.resolve({ status: 'not_found' as const }),
  });

  onTestFinished(() => socket.stop());

  expect(
    sendSessionRequest(ctx.path, {
      command: 'label',
      sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
      label: 'phone',
    }),
  ).rejects.toThrowWithMessage(
    Error,
    'nixie answered the session label request with 404: no device session that is still signed in has that ID',
  );
});
