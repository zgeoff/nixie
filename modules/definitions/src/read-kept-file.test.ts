import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readKeptFile } from './read-kept-file';

// a resolved definitions root, beside a directory outside it
async function setupTest() {
  const created = await mkdtemp(join(tmpdir(), 'nixie-kept-file-'));

  onTestFinished(() => rm(created, { recursive: true, force: true }));

  // the snapshot reads from the resolved root, and the temp directory can sit behind a symlink
  const dir = await realpath(created);

  const root = join(dir, 'definitions');
  const outside = join(dir, 'outside');

  await mkdir(root);
  await mkdir(outside);

  return { root, outside };
}

test('it reads a file under the root with its line endings normalized', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\r\n');

  const kept = await readKeptFile(ctx.root, 'persona.md', 1024);

  expect(kept).toStrictEqual(['persona.md', new TextEncoder().encode('# Persona\n')]);
});

test('it refuses a file swapped for a symlink since the walk', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'notes.md'), 'kept\n');
  await symlink(join(ctx.root, 'notes.md'), join(ctx.root, 'persona.md'));

  expect(readKeptFile(ctx.root, 'persona.md', 1024)).rejects.toMatchObject({
    name: 'SnapshotError',
    message: 'a file changed while the snapshot read it: persona.md',
    paths: ['persona.md'],
  });
});

test('it refuses a file that grew past the per-file limit since the walk', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'persona.md'), 'x'.repeat(1025));

  expect(readKeptFile(ctx.root, 'persona.md', 1024)).rejects.toMatchObject({
    name: 'SnapshotError',
    message: 'a file changed while the snapshot read it: persona.md',
    paths: ['persona.md'],
  });
});

test('it refuses a file whose directory became a symlink outside the root since the walk', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.outside, 'morning.yaml'), 'id: morning\n');
  await symlink(ctx.outside, join(ctx.root, 'jobs'));

  expect(readKeptFile(ctx.root, 'jobs/morning.yaml', 1024)).rejects.toMatchObject({
    name: 'SnapshotError',
    message: 'a symlink leads outside the definitions root: jobs/morning.yaml',
    paths: ['jobs/morning.yaml'],
  });
});
