import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { buildResticClient } from './restic/build-restic-client';
import { createStubRestic } from './test-utils/create-stub-restic';
import { readBackupJobBundle } from './test-utils/read-backup-job-bundle';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-job-bundle-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);
  const job = await readBackupJobBundle();

  const dataRepository = { repository: join(directory, 'data'), password: 'data-pass' };
  const keyRepository = { repository: join(directory, 'keys'), password: 'key-pass' };
  const data = buildResticClient({ restic, backendEnv: {} }, dataRepository, 'data');
  const keys = buildResticClient({ restic, backendEnv: {} }, keyRepository, 'key');

  await data.createRepository();
  await keys.createRepository();

  await writeFile(join(directory, 'copy.bin'), 'copy');

  const tags = ['set-1', 'kind-scheduled', 'publish-1'];

  await keys.writeSnapshot(join(directory, 'copy.bin'), 'keys.db', tags);
  await data.writeSnapshot(join(directory, 'copy.bin'), 'nixie.db', tags);

  const env = {
    NIXIE_BACKUP_RESTIC: restic,
    NIXIE_BACKUP_DATA_REPOSITORY: dataRepository.repository,
    NIXIE_BACKUP_DATA_PASSWORD: dataRepository.password,
    NIXIE_BACKUP_KEY_REPOSITORY: keyRepository.repository,
    NIXIE_BACKUP_KEY_PASSWORD: keyRepository.password,
  };

  return { directory, job, env };
}

test('it fetches the pair into a new directory, and refuses the same directory a second time', async () => {
  const ctx = await setupTest();

  const target = join(ctx.directory, 'fetched');

  const first = await $`${process.execPath} ${ctx.job} fetch --to ${target}`
    .env(ctx.env)
    .nothrow()
    .quiet();

  const names = await readdir(target);

  const second = await $`${process.execPath} ${ctx.job} fetch --to ${target}`
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(first.exitCode).toBe(0);
  expect(names.toSorted()).toStrictEqual(['fetched-pair.json', 'keys.db', 'nixie.db']);
  expect(second.exitCode).toBe(1);
});

test('it prints one line of JSON for each snapshot of both repositories', async () => {
  const ctx = await setupTest();

  const snapshots = await $`${process.execPath} ${ctx.job} snapshots`
    .env(ctx.env)
    .nothrow()
    .quiet();

  const lines = snapshots.stdout.toString().trim().split('\n');

  expect(snapshots.exitCode).toBe(0);

  expect(lines.map((line): unknown => JSON.parse(line))).toStrictEqual([
    expect.objectContaining({ repository: 'data', set: 1, kind: 'scheduled', publish: 1 }),
    expect.objectContaining({ repository: 'key', set: 1, kind: 'scheduled', publish: 1 }),
  ]);
});
