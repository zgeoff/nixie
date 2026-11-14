import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubRestic } from '../test-utils/create-stub-restic';
import { buildResticClient } from './build-restic-client';
import { ResticError } from './restic-error';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-restic-client-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  const calls = join(directory, 'calls.jsonl');

  const client = buildResticClient(
    { restic, backendEnv: { STUB_RESTIC_LOG: calls } },
    { repository: join(directory, 'repo'), password: 'key-pass' },
    'key',
  );

  return { directory, restic, calls, client };
}

test('it creates a repository that does not exist, and opens one that does', async () => {
  const ctx = await setupTest();

  await ctx.client.createRepository();
  await ctx.client.createRepository();

  const calls = await Bun.file(ctx.calls).text();

  expect(calls.match(/"init"/gu)).toHaveLength(1);
});

test('it reads back the ID, the parsed tags and the time of the snapshot it writes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'keys.db'), 'key rows');

  await ctx.client.createRepository();

  const before = Date.now();

  const snapshotID = await ctx.client.writeSnapshot(join(ctx.directory, 'keys.db'), 'keys.db', [
    'set-18',
    'kind-forget',
    'publish-42',
    'legacy-set-17',
    'proven-from-7',
  ]);

  const snapshots = await ctx.client.readSnapshots();

  expect(snapshots).toStrictEqual([
    {
      snapshotID,
      writtenAt: expect.toBeWithin(before - 1000, Date.now() + 1000),
      set: 18,
      kind: 'forget',
      publish: 42,
      legacySet: 17,
      provenFrom: 7,
    },
  ]);
});

test('it names the step, the repo and the exit code of a failed restic', async () => {
  const ctx = await setupTest();

  const client = buildResticClient(
    { restic: ctx.restic, backendEnv: {} },
    { repository: join(ctx.directory, 'missing'), password: 'key-pass' },
    'key',
  );

  expect(client.runPrune()).rejects.toThrowWithMessage(
    ResticError,
    /^restic prune in the key repo exited 10: Fatal: repository does not exist/u,
  );
});

test('it refuses a repository whose password is wrong, rather than creating another', async () => {
  const ctx = await setupTest();

  await ctx.client.createRepository();

  const wrong = buildResticClient(
    { restic: ctx.restic, backendEnv: {} },
    { repository: join(ctx.directory, 'repo'), password: 'another-pass' },
    'key',
  );

  expect(wrong.createRepository()).rejects.toThrowWithMessage(
    ResticError,
    'restic cat config in the key repo exited 12: Fatal: wrong password or no key found',
  );
});

test('it removes nothing when it is given no snapshot', async () => {
  const ctx = await setupTest();

  await ctx.client.removeSnapshots([]);

  const called = await Bun.file(ctx.calls).exists();

  expect(called).toBeFalse();
});
