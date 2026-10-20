import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'run', 'control.sock') };
}

test('it answers each request on the socket with the responder', async () => {
  const ctx = await setupTest();

  const socket = await startControlSocket({
    path: ctx.path,
    respond: () => Promise.resolve(new Response('answered')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/rpc/sessions/list', {
    method: 'POST',
    unix: ctx.path,
  });

  const body = await response.text();

  expect(body).toBe('answered');
});

test('it keeps the socket in a directory only nixie’s user may enter', async () => {
  const ctx = await setupTest();

  const socket = await startControlSocket({
    path: ctx.path,
    respond: () => Promise.resolve(new Response('answered')),
  });

  onTestFinished(() => socket.stop());

  const directory = await stat(join(ctx.path, '..'));

  expect(directory.mode & 0o777).toBe(0o700);
});

test('it replaces a stale socket file that a server before it left behind', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.path, '..'), { recursive: true });
  await writeFile(ctx.path, '');

  const socket = await startControlSocket({
    path: ctx.path,
    respond: () => Promise.resolve(new Response('answered')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/', { unix: ctx.path });
  const body = await response.text();

  expect(body).toBe('answered');
});

test('it removes the socket file when it stops', async () => {
  const ctx = await setupTest();

  const socket = await startControlSocket({
    path: ctx.path,
    respond: () => Promise.resolve(new Response('answered')),
  });

  onTestFinished(() => socket.stop());

  await socket.stop();

  const exists = await Bun.file(ctx.path).exists();

  expect(exists).toBeFalse();
});
