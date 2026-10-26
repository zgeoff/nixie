import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeLockFiles } from './node-lock-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'consent-lock-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it creates the lock file with its text, readable by its owner only', async () => {
  const ctx = await setupTest();

  await nodeLockFiles.createExclusive(join(ctx.directory, 'checks.jsonl.lock'), '4242\n');

  const text = await readFile(join(ctx.directory, 'checks.jsonl.lock'), 'utf8');
  const info = await stat(join(ctx.directory, 'checks.jsonl.lock'));

  expect(text).toBe('4242\n');
  expect(info.mode & 0o777).toBe(0o600);
});

test('it refuses to create a lock file that exists', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'checks.jsonl.lock'), '17\n');

  expect(
    nodeLockFiles.createExclusive(join(ctx.directory, 'checks.jsonl.lock'), '4242\n'),
  ).rejects.toMatchObject({ code: 'EEXIST' });
});

test('it removes a lock file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'checks.jsonl.lock'), '17\n');

  await nodeLockFiles.remove(join(ctx.directory, 'checks.jsonl.lock'));

  const entries = await readdir(ctx.directory);

  expect(entries).toStrictEqual([]);
});

test('it removes a lock file that is already gone without an error', async () => {
  const ctx = await setupTest();

  expect(nodeLockFiles.remove(join(ctx.directory, 'checks.jsonl.lock'))).resolves.toBeUndefined();
});
