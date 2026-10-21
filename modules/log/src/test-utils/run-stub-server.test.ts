import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimWriterLock } from '../claim-writer-lock';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-stub-server-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir, stubServer: join(import.meta.dir, 'run-stub-server.ts') };
}

test('it prints the epoch of the writer it started', async () => {
  const ctx = await setupTest();

  const server = Bun.spawn([process.execPath, ctx.stubServer, ctx.dataDir], { stdout: 'pipe' });

  onTestFinished(async () => {
    server.kill('SIGKILL');

    await server.exited;
  });

  const printed = await server.stdout.getReader().read();

  expect(new TextDecoder().decode(printed.value)).toBe('writer epoch 1\n');
});

test('it keeps holding the writer lock after it prints the epoch', async () => {
  const ctx = await setupTest();

  const server = Bun.spawn([process.execPath, ctx.stubServer, ctx.dataDir], { stdout: 'pipe' });

  onTestFinished(async () => {
    server.kill('SIGKILL');

    await server.exited;
  });

  await server.stdout.getReader().read();

  expect(() => claimWriterLock(ctx.dataDir)).toThrowWithMessage(
    Error,
    'writer lock held by another process',
  );
});

test('it exits non-zero with the start error on stderr when the writer fails to start', async () => {
  const ctx = await setupTest();

  const lock = claimWriterLock(ctx.dataDir);

  onTestFinished(() => {
    lock.release();
  });

  const server = Bun.spawn([process.execPath, ctx.stubServer, ctx.dataDir], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  onTestFinished(async () => {
    server.kill('SIGKILL');

    await server.exited;
  });

  const exitCode = await server.exited;

  const stderr = await new Response(server.stderr).text();

  expect(exitCode).not.toBe(0);
  expect(stderr).toInclude('WriterLockHeldError: writer lock held by another process');
});

test('it exits non-zero with its usage on stderr when no data directory is given', async () => {
  const ctx = await setupTest();

  const server = Bun.spawn([process.execPath, ctx.stubServer], { stdout: 'pipe', stderr: 'pipe' });

  onTestFinished(async () => {
    server.kill('SIGKILL');

    await server.exited;
  });

  const exitCode = await server.exited;

  const stderr = await new Response(server.stderr).text();

  expect(exitCode).not.toBe(0);
  expect(stderr).toInclude('usage: run-stub-server.ts <data directory>');
});
