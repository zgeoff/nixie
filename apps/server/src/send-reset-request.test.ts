import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendResetRequest } from './send-reset-request';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'control.sock') };
}

test('it returns what the running server reports of the finished reset', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    runReset: () =>
      Promise.resolve({
        resetAt: new Date('2026-10-14T09:30:00.000Z'),
        lastSequence: 412,
        keptSessions: 2,
      }),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const reset = await sendResetRequest(ctx.path);

  expect(reset).toStrictEqual({
    resetAt: new Date('2026-10-14T09:30:00.000Z'),
    lastSequence: 412,
    keptSessions: 2,
  });
});

test('it rejects with the status and the reason when the reset fails', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    runReset: () => Promise.reject(new Error('the sandbox runtime refused the destroy')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  expect(sendResetRequest(ctx.path)).rejects.toThrowWithMessage(
    Error,
    'nixie answered the reset request with 500: the sandbox runtime refused the destroy',
  );
});

test('it rejects when no server listens on the socket', async () => {
  const ctx = await setupTest();

  expect(sendResetRequest(ctx.path)).rejects.toThrow();
});
