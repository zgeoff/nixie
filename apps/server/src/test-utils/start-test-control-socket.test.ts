import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { buildHostClient } from '../build-host-client';
import { startTestControlSocket } from './start-test-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'control.sock') };
}

test('it serves the host procedures over the memory given', async () => {
  const ctx = await setupTest();
  const memory = await startTestMemory();

  await startTestControlSocket({ path: ctx.path, readMemory: () => memory.store });

  const pending = await buildHostClient(ctx.path).memory.proposals.list();

  expect(pending).toStrictEqual([]);
});

test('it refuses a reset, since no server runs behind the socket', async () => {
  const ctx = await setupTest();

  await startTestControlSocket({ path: ctx.path });

  const reset = buildHostClient(ctx.path).reset();

  await reset.catch(() => {});

  expect(reset).rejects.toMatchObject({
    status: 500,
    message: 'no server runs behind the test socket',
  });
});

test('it stops the socket when the test finishes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  const path = join(directory, 'control.sock');

  await startTestControlSocket({ path });

  onTestFinished(async () => {
    const exists = await Bun.file(path).exists();

    expect(exists).toBeFalse();
  });

  onTestFinished(() => rm(directory, { recursive: true, force: true }));
});
