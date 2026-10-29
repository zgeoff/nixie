import { expect, onTestFinished, test } from 'bun:test';
import { appendFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupReceiptSchema, parseBackupFile } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildResticClient } from './build-restic-client';
import { runJobPass } from './run-job-pass';
import { createStagedSet } from './test-utils/create-staged-set';
import { createStubRestic } from './test-utils/create-stub-restic';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-job-pass-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  const calls = join(directory, 'restic-calls.jsonl');

  const config = {
    stagingDir: join(directory, 'backup'),
    restic,
    backendEnv: { STUB_RESTIC_LOG: calls },
    retention: { hourly: 24, daily: 7, weekly: 4, monthly: 6 },
  };

  const dataRepository = join(directory, 'repos', 'data');
  const keyRepository = join(directory, 'repos', 'keys');

  const repos = {
    data: buildResticClient(config, { repository: dataRepository, password: 'data-pass' }, 'data'),
    keys: buildResticClient(config, { repository: keyRepository, password: 'key-pass' }, 'key'),
  };

  return { config, repos, calls, dataRepository, keyRepository };
}

test('it publishes a complete set to both repos, writes a published receipt, and removes the copies', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  const receipts = await runJobPass(ctx.config, ctx.repos);

  const directory = join(ctx.config.stagingDir, '000000000001');

  const names = await readdir(directory);
  const text = await Bun.file(join(directory, 'receipt.json')).text();

  const written = parseBackupFile(text, backupReceiptSchema);

  const dataSnapshots = await readdir(join(ctx.dataRepository, 'snapshots'));
  const keySnapshots = await readdir(join(ctx.keyRepository, 'snapshots'));

  expect(receipts).toStrictEqual([
    {
      format: 1,
      sequence: 1,
      writtenAt: expect.any(Number),
      status: 'published',
      dataSnapshotID: expect.stringMatching(/^[0-9a-f]{64}$/u),
      keySnapshotID: expect.stringMatching(/^[0-9a-f]{64}$/u),
      removedKeySnapshotIDs: [],
      prune: 'passed',
      check: 'passed',
      failure: null,
    },
  ]);

  const [receipt] = receipts;

  invariant(receipt, 'the pass publishes the one staged set');

  expect(written).toStrictEqual({ value: receipt });
  expect(names).toIncludeSameMembers(['manifest.json', 'complete', 'receipt.json']);
  expect(dataSnapshots).toStrictEqual([`${receipt.dataSnapshotID ?? ''}.json`]);
  expect(keySnapshots).toStrictEqual([`${receipt.keySnapshotID ?? ''}.json`]);
});

test('it ships no set that lacks its marker, and runs no restic', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 1,
    kind: 'scheduled',
    isComplete: false,
  });

  const receipts = await runJobPass(ctx.config, ctx.repos);
  const names = await readdir(join(ctx.config.stagingDir, '000000000001'));
  const calls = await Bun.file(ctx.calls).exists();

  expect(receipts).toStrictEqual([]);
  expect(names).toIncludeSameMembers(['nixie.db', 'keys.db']);
  expect(calls).toBeFalse();
});

test('it keeps the newest key snapshot alone and prunes the blob of every older one, while the data repo keeps both', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  await runJobPass(ctx.config, ctx.repos);

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 2,
    kind: 'forget',
    isComplete: true,
  });

  const receipts = await runJobPass(ctx.config, ctx.repos);

  const firstText = await Bun.file(
    join(ctx.config.stagingDir, '000000000001', 'receipt.json'),
  ).text();

  const first = parseBackupFile(firstText, backupReceiptSchema);

  const keySnapshots = await readdir(join(ctx.keyRepository, 'snapshots'));
  const keyBlobs = await readdir(join(ctx.keyRepository, 'blobs'));
  const dataSnapshots = await readdir(join(ctx.dataRepository, 'snapshots'));

  invariant('value' in first, 'the first set has a receipt the job wrote');

  expect(receipts).toMatchObject([
    {
      sequence: 2,
      status: 'published',
      removedKeySnapshotIDs: [first.value.keySnapshotID],
      prune: 'passed',
      check: 'passed',
    },
  ]);

  expect(keySnapshots).toStrictEqual([`${receipts[0]?.keySnapshotID ?? ''}.json`]);
  expect(keyBlobs).toHaveLength(1);
  expect(dataSnapshots).toHaveLength(2);
});

test('it ships sets in sequence order', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 2,
    kind: 'forget',
    isComplete: true,
  });

  const receipts = await runJobPass(ctx.config, ctx.repos);
  const calls = await Bun.file(ctx.calls).text();

  const tags = calls
    .split('\n')
    .filter((line) => line.includes('"backup"'))
    .map((line) => /set-(?<set>\d+)/u.exec(line)?.groups?.['set']);

  expect(receipts.map((receipt) => receipt.sequence)).toStrictEqual([1, 2]);
  expect(tags).toStrictEqual(['1', '1', '2', '2']);
});

test('it writes a failed receipt for a copy that does not match its checksum, and uploads nothing', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  await appendFile(join(ctx.config.stagingDir, '000000000001', 'keys.db'), 'a changed byte');

  const receipts = await runJobPass(ctx.config, ctx.repos);
  const calls = await Bun.file(ctx.calls).exists();

  expect(receipts).toStrictEqual([
    {
      format: 1,
      sequence: 1,
      writtenAt: expect.any(Number),
      status: 'failed',
      dataSnapshotID: null,
      keySnapshotID: null,
      removedKeySnapshotIDs: [],
      prune: 'not-run',
      check: 'not-run',
      failure: 'the keys.db copy of set 1 does not match the checksum its manifest records',
    },
  ]);

  expect(calls).toBeFalse();
});

test('it writes a failed receipt that names a failed prune, and runs no check after it', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 1,
    kind: 'forget',
    isComplete: true,
  });

  const receipts = await runJobPass(ctx.config, {
    data: ctx.repos.data,
    keys: buildResticClient(
      { restic: ctx.config.restic, backendEnv: { STUB_RESTIC_FAIL: 'prune' } },
      { repository: ctx.keyRepository, password: 'key-pass' },
      'key',
    ),
  });

  expect(receipts).toMatchObject([
    {
      sequence: 1,
      status: 'failed',
      dataSnapshotID: expect.stringMatching(/^[0-9a-f]{64}$/u),
      keySnapshotID: expect.stringMatching(/^[0-9a-f]{64}$/u),
      prune: 'failed',
      check: 'not-run',
      failure: 'restic prune in the key repo exited 1: Fatal: the stub fails prune',
    },
  ]);
});

test('it leaves a set that holds its receipt alone', async () => {
  const ctx = await setupTest();

  await createStagedSet({
    stagingDir: ctx.config.stagingDir,
    sequence: 1,
    kind: 'scheduled',
    isComplete: true,
  });

  await runJobPass(ctx.config, ctx.repos);

  const receipts = await runJobPass(ctx.config, ctx.repos);

  expect(receipts).toStrictEqual([]);
});
