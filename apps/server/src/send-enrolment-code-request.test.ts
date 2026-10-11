import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sendEnrolmentCodeRequest } from './send-enrolment-code-request';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'control.sock') };
}

test('it returns the code the running server issues', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () =>
      Promise.resolve({ code: 'ABCD-EFGH', expiresAt: new Date('2026-10-11T12:15:00.000Z') }),
  });

  onTestFinished(() => socket.stop());

  const issued = await sendEnrolmentCodeRequest(ctx.path);

  expect(issued).toStrictEqual({
    code: 'ABCD-EFGH',
    expiresAt: new Date('2026-10-11T12:15:00.000Z'),
  });
});

test('it rejects when no server listens on the socket', async () => {
  const ctx = await setupTest();

  expect(sendEnrolmentCodeRequest(ctx.path)).rejects.toThrow();
});
