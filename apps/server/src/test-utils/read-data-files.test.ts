import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('it skips a file that is removed between the directory read and the file read', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'nixie.db'), 'Fennel-page-3RX8');
  await writeFile(join(ctx.dir, 'nixie.db-journal'), 'Sorrel-page-9KD2');

  const files = await readDataFiles(ctx.dir, async (path) => {
    await rm(join(ctx.dir, 'nixie.db-journal'), { force: true });

    return readFile(path);
  });

  expect(files).toStrictEqual([{ name: 'nixie.db', text: 'Fennel-page-3RX8' }]);
});

test('it fails on a read error other than a missing file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'nixie.db'), 'Fennel-page-3RX8');

  expect(
    readDataFiles(ctx.dir, () =>
      Promise.reject(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })),
    ),
  ).rejects.toMatchObject({ code: 'EACCES' });
});
