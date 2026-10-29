import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localBackupFileReads } from './local-backup-file-reads';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-backup-reads-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it lists the names in a directory', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '000000000001'));
  await writeFile(join(ctx.directory, 'notes.txt'), 'kept by the operator');

  const names = await localBackupFileReads.readDirectory(ctx.directory);

  expect(names).toIncludeSameMembers(['000000000001', 'notes.txt']);
});

test('it fails the listing of a directory that does not exist with ENOENT', async () => {
  const ctx = await setupTest();

  const refused = await localBackupFileReads.readDirectory(join(ctx.directory, 'missing')).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refused).toMatchObject({ code: 'ENOENT' });
});

test('it reads whether a file exists', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'complete'), '');

  const found = await localBackupFileReads.probeFile(join(ctx.directory, 'complete'));
  const missing = await localBackupFileReads.probeFile(join(ctx.directory, 'receipt.json'));

  expect(found).toBeTrue();
  expect(missing).toBeFalse();
});

test('it reads a file as text', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'manifest.json'), '{"format": 1}');

  const text = await localBackupFileReads.readText(join(ctx.directory, 'manifest.json'));

  expect(text).toBe('{"format": 1}');
});

test('it reads the size and sha256 of a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'nixie.db'), 'nixie.db of set 1\n');

  const digest = await localBackupFileReads.readFileSHA256(join(ctx.directory, 'nixie.db'));

  expect(digest).toStrictEqual({
    bytes: 18,
    sha256: 'c8d69b02b4aa275fc8f163b9d7a867481f8404b3bd28853f20202e7b4f5c69aa',
  });
});
