import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'run', 'control.sock') };
}

test('it issues an enrolment code to a request on the socket', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () =>
      Promise.resolve({ code: 'ABCD-EFGH', expiresAt: new Date('2026-10-11T12:15:00.000Z') }),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/enrolment-codes', {
    method: 'POST',
    unix: ctx.path,
  });
  const body = await response.json();

  expect(body).toStrictEqual({
    code: 'ABCD-EFGH',
    expiresAt: '2026-10-11T12:15:00.000Z',
  });
});

test('it keeps the socket in a directory only nixie’s user may enter', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const dir = await stat(join(ctx.path, '..'));

  expect(dir.mode & 0o777).toBe(0o700);
});

test('it answers any other request with 404', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/sessions', { method: 'POST', unix: ctx.path });

  expect(response.status).toBe(404);
});
