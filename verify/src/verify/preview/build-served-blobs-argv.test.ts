import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { servedSourceFolders } from './build-served-blobs-argv';

async function setupTest() {
  const root = await mkdtemp(join(tmpdir(), 'nixie-source-blobs-'));

  onTestFinished(() => rm(root, { recursive: true, force: true }));

  const lister = join(import.meta.dir, '..', '..', '..', '..', 'preview', 'write-source-blobs.ts');

  return { root, runLister: () => $`bun ${lister} ${root}`.quiet().text() };
}

test('it lists the source folders the doctor compares, with the blob id git gives each file', async () => {
  const ctx = await setupTest();

  for (const folder of [...servedSourceFolders, 'docs']) {
    await mkdir(join(ctx.root, folder, 'node_modules'), { recursive: true });
    await writeFile(join(ctx.root, folder, 'notes.txt'), `the ${folder} folder\n`);
    await writeFile(join(ctx.root, folder, 'node_modules', 'skipped.js'), 'skipped\n');
  }

  const listed = await ctx.runLister();

  const expected = await Promise.all(
    servedSourceFolders.map(async (folder) => {
      const blob = await $`git hash-object ${join(ctx.root, folder, 'notes.txt')}`.quiet().text();

      return `${blob.trim()} ${folder}/notes.txt`;
    }),
  );

  expect(listed.trim().split('\n')).toStrictEqual(expected);
});
