import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunLock } from './create-run-lock.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'consent-lock-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it refuses a second lock on a run file the first lock holds', async () => {
  const ctx = await setupTest();

  await createRunLock([join(ctx.dir, 'checks.jsonl'), join(ctx.dir, 'labels.jsonl')]);

  expect(createRunLock([join(ctx.dir, 'labels.jsonl')])).rejects.toThrow(
    `${join(ctx.dir, 'labels.jsonl.lock')} exists, so another label or check run holds these files`,
  );
});

test('it frees the run files once the lock is removed', async () => {
  const ctx = await setupTest();
  const first = await createRunLock([join(ctx.dir, 'checks.jsonl'), join(ctx.dir, 'labels.jsonl')]);

  await first.remove();

  expect(await readdir(ctx.dir)).toStrictEqual([]);
});

test('it releases the locks it took when a later run file is already held', async () => {
  const ctx = await setupTest();

  await createRunLock([join(ctx.dir, 'labels.jsonl')]);

  const refusal = await createRunLock([join(ctx.dir, 'checks.jsonl'), join(ctx.dir, 'labels.jsonl')]).then(
    () => null,
    (error: unknown) => error,
  );

  expect(refusal).toBeInstanceOf(Error);
  expect(await readdir(ctx.dir)).toStrictEqual(['labels.jsonl.lock']);
});
