import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunLock } from './create-run-lock.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'consent-lock-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it refuses a second lock on a run file the first lock holds', async () => {
  const ctx = await setupTest();

  await createRunLock([join(ctx.directory, 'checks.jsonl'), join(ctx.directory, 'labels.jsonl')]);

  expect(createRunLock([join(ctx.directory, 'labels.jsonl')])).rejects.toThrow(
    `${join(ctx.directory, 'labels.jsonl.lock')} exists, so another label or check run holds these files`,
  );
});

test('it frees the run files once the lock is removed', async () => {
  const ctx = await setupTest();

  const first = await createRunLock([
    join(ctx.directory, 'checks.jsonl'),
    join(ctx.directory, 'labels.jsonl'),
  ]);

  await first.remove();

  const entries = await readdir(ctx.directory);

  expect(entries).toStrictEqual([]);
});

test('it releases the locks it took when a later run file is already held', async () => {
  const ctx = await setupTest();

  await createRunLock([join(ctx.directory, 'labels.jsonl')]);

  const refusal = await createRunLock([
    join(ctx.directory, 'checks.jsonl'),
    join(ctx.directory, 'labels.jsonl'),
  ]).then(
    () => null,
    (error: unknown) => error,
  );

  const entries = await readdir(ctx.directory);

  expect(refusal).toBeInstanceOf(Error);
  expect(entries).toStrictEqual(['labels.jsonl.lock']);
});
