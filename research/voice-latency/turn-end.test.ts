import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'turn-end-'));

  onTestFinished(() => rm(dir, { force: true, recursive: true }));

  return { dir };
}

test('it refuses an output file that already holds a run and leaves its bytes alone', async () => {
  const ctx = await setupTest();
  const out = join(ctx.dir, 'turn-end-hvb.jsonl');
  await writeFile(out, '{"set":"hvb","index":0}\n');

  const runner = Bun.spawnSync([process.execPath, 'turn-end.ts', '--set', 'hvb', '--out', out], {
    cwd: import.meta.dir,
  });

  expect(runner.exitCode).toBe(1);
  expect(runner.stderr.toString()).toBe(`${out} already holds a run; pass --replace to start it again\n`);
  expect(await readFile(out, 'utf8')).toBe('{"set":"hvb","index":0}\n');
});
