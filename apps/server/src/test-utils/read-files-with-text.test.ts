import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFilesWithText } from './read-files-with-text';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-scan-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  return { root };
}

test('it finds every file under the directory that holds the text, at any depth', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'a', 'b'), { recursive: true });
  await writeFile(join(ctx.root, 'top.jsonl'), '{"text":"the blue flowerpot"}\n');
  await writeFile(join(ctx.root, 'a', 'b', 'deep.jsonl'), '{"text":"the blue flowerpot"}\n');
  await writeFile(join(ctx.root, 'a', 'clean.jsonl'), '{"text":"the side gate"}\n');

  const found = await readFilesWithText(ctx.root, 'blue flowerpot');

  expect(found).toStrictEqual(['a/b/deep.jsonl', 'top.jsonl']);
});

test('it reads the whole of a file larger than 50 MB', async () => {
  const ctx = await setupTest();

  const filler = Buffer.alloc(51 * 1024 * 1024, 'x');

  await writeFile(join(ctx.root, 'large.jsonl'), Buffer.concat([filler, Buffer.from('flowerpot')]));

  const found = await readFilesWithText(ctx.root, 'flowerpot');

  expect(found).toStrictEqual(['large.jsonl']);
});

test('it finds nothing under a directory that is gone', async () => {
  const ctx = await setupTest();
  const found = await readFilesWithText(join(ctx.root, 'missing'), 'flowerpot');

  expect(found).toStrictEqual([]);
});
