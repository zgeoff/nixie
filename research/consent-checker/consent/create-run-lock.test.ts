import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunLock } from './create-run-lock.ts';
import { nodeLockFiles } from './node-lock-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'consent-lock-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it refuses a second lock on a run file the first lock holds', async () => {
  const ctx = await setupTest();

  await createRunLock(
    [join(ctx.directory, 'checks.jsonl'), join(ctx.directory, 'labels.jsonl')],
    nodeLockFiles,
  );

  expect(createRunLock([join(ctx.directory, 'labels.jsonl')], nodeLockFiles)).rejects.toThrow(
    `${join(ctx.directory, 'labels.jsonl.lock')} exists, so another command of this spike holds these files`,
  );
});

test('it frees the run files once the lock is removed', async () => {
  const ctx = await setupTest();

  const first = await createRunLock(
    [join(ctx.directory, 'checks.jsonl'), join(ctx.directory, 'labels.jsonl')],
    nodeLockFiles,
  );

  await first.remove();

  const entries = await readdir(ctx.directory);

  expect(entries).toStrictEqual([]);
});

test('it releases the locks it took when a later run file is already held', async () => {
  const ctx = await setupTest();

  await createRunLock([join(ctx.directory, 'labels.jsonl')], nodeLockFiles);

  const refusal = await createRunLock(
    [join(ctx.directory, 'checks.jsonl'), join(ctx.directory, 'labels.jsonl')],
    nodeLockFiles,
  ).then(
    () => null,
    (error: unknown) => error,
  );

  const entries = await readdir(ctx.directory);

  expect(refusal).toBeInstanceOf(Error);
  expect(entries).toStrictEqual(['labels.jsonl.lock']);
});

test('it removes a lock file whose write failed, and passes the failure on', async () => {
  const failure = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
  const removed: string[] = [];

  const refusal = await createRunLock(['/runs/checks.jsonl'], {
    createExclusive: () => Promise.reject(failure),
    remove: (path) => {
      removed.push(path);

      return Promise.resolve();
    },
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBe(failure);
  expect(removed).toStrictEqual(['/runs/checks.jsonl.lock']);
});
