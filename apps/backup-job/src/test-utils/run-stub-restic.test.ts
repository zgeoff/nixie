import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubRestic } from './create-stub-restic';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-stub-restic-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  return { directory, restic, repository: join(directory, 'repo') };
}

test('it exits 10 for a repository that does not exist, as restic does', async () => {
  const ctx = await setupTest();

  const probe = await $`${ctx.restic} --no-cache cat config`
    .env({ RESTIC_REPOSITORY: ctx.repository, RESTIC_PASSWORD: 'pass-a' })
    .nothrow()
    .quiet();

  expect(probe.exitCode).toBe(10);
});

test('it exits 12 on a wrong password, as restic does', async () => {
  const ctx = await setupTest();

  await $`${ctx.restic} init`
    .env({ RESTIC_REPOSITORY: ctx.repository, RESTIC_PASSWORD: 'pass-a' })
    .quiet();

  const probe = await $`${ctx.restic} cat config`
    .env({ RESTIC_REPOSITORY: ctx.repository, RESTIC_PASSWORD: 'pass-b' })
    .nothrow()
    .quiet();

  expect(probe.exitCode).toBe(12);
});

test('it prints a summary with the snapshot ID of a backup, and dumps the content back', async () => {
  const ctx = await setupTest();

  const env = { RESTIC_REPOSITORY: ctx.repository, RESTIC_PASSWORD: 'pass-a' };

  await writeFile(join(ctx.directory, 'keys.db'), 'key rows');

  await $`${ctx.restic} init`.env(env).quiet();

  const backup =
    await $`${ctx.restic} backup --json --host nixie --stdin --stdin-filename keys.db --tag set-1 < ${join(ctx.directory, 'keys.db')}`
      .env(env)
      .quiet();

  const summary: unknown = JSON.parse(backup.stdout.toString().trim().split('\n').at(-1) ?? '');

  const snapshots: unknown = await $`${ctx.restic} snapshots --json`.env(env).json();

  expect(summary).toStrictEqual({ message_type: 'summary', snapshot_id: expect.any(String) });

  expect(snapshots).toStrictEqual([
    {
      id: expect.stringMatching(/^[0-9a-f]{64}$/u),
      hostname: 'nixie',
      paths: ['/keys.db'],
      tags: ['set-1'],
      blob: expect.any(String),
    },
  ]);
});

test('it keeps the blob of a forgotten snapshot until a prune removes it', async () => {
  const ctx = await setupTest();

  const env = { RESTIC_REPOSITORY: ctx.repository, RESTIC_PASSWORD: 'pass-a' };

  await writeFile(join(ctx.directory, 'keys.db'), 'key rows');

  await $`${ctx.restic} init`.env(env).quiet();

  const backup =
    await $`${ctx.restic} backup --json --stdin --stdin-filename keys.db < ${join(ctx.directory, 'keys.db')}`
      .env(env)
      .quiet();

  const id = /"snapshot_id":"(?<id>[0-9a-f]{64})"/u.exec(backup.stdout.toString())?.groups?.['id'];

  await $`${ctx.restic} forget ${id ?? ''}`.env(env).quiet();

  const beforePrune = await readdir(join(ctx.repository, 'blobs'));

  await $`${ctx.restic} prune --max-unused 0`.env(env).quiet();

  const afterPrune = await readdir(join(ctx.repository, 'blobs'));

  expect(beforePrune).toHaveLength(1);
  expect(afterPrune).toStrictEqual([]);
});

test('it fails the command that STUB_RESTIC_FAIL names', async () => {
  const ctx = await setupTest();

  const env = { RESTIC_REPOSITORY: ctx.repository, RESTIC_PASSWORD: 'pass-a' };

  await $`${ctx.restic} init`.env(env).quiet();

  const prune = await $`${ctx.restic} prune --max-unused 0`
    .env({ ...env, STUB_RESTIC_FAIL: 'prune' })
    .nothrow()
    .quiet();

  expect(prune.exitCode).toBe(1);
  expect(prune.stderr.toString()).toBe('Fatal: the stub fails prune\n');
});

test('it logs each call with its arguments, and whether a password reached it', async () => {
  const ctx = await setupTest();

  const log = join(ctx.directory, 'calls.jsonl');

  await $`${ctx.restic} --no-cache init`
    .env({ RESTIC_REPOSITORY: ctx.repository, RESTIC_PASSWORD: 'pass-a', STUB_RESTIC_LOG: log })
    .quiet();

  const calls = await Bun.file(log).text();

  expect(calls).toBe(
    `${JSON.stringify({ repository: ctx.repository, args: ['--no-cache', 'init'], hasPassword: true })}\n`,
  );
});
