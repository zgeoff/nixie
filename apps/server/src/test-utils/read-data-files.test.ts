import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDataFiles } from './read-data-files';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-data-files-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads each file at the root as text and leaves out the sandboxes directory', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'nixie.db'), Buffer.from([0x00, 0x41, 0xff]));
  await mkdir(join(ctx.dir, 'sandboxes'));
  await writeFile(join(ctx.dir, 'sandboxes', 'transcript.jsonl'), 'text');

  const files = await readDataFiles(ctx.dir);

  expect(files).toStrictEqual([{ name: 'nixie.db', text: '\u0000Aÿ' }]);
});
