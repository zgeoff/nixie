import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { makeFolderExec, readDiskFiles, writeDiskFiles } from './make-folder-exec';

async function setupTest() {
  const root = await mkdtemp(`${tmpdir()}/folder-exec-`);

  onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });

  return {
    root,
    exec: makeFolderExec(root, { loseWrite: (path) => path === 'lost.txt' }),
  };
}

test('it runs a command in the disk folder of its sandbox, below the working folder it names', async () => {
  const ctx = await setupTest();

  await writeDiskFiles(ctx.root, 'one', { '/home/a/note.txt': 'hello' });

  const result = await ctx.exec(
    { argv: ['cat', 'note.txt'], cwd: '/home/a' },
    { sandboxID: 'one' },
  );

  expect(result).toMatchObject({ code: 0, stdout: { bytes: new TextEncoder().encode('hello') } });
});

test('it writes what a command reads from its standard input and lists the files of a disk', async () => {
  const ctx = await setupTest();

  await ctx.exec(
    { argv: ['sh', '-c', 'mkdir -p d && cat > d/out'], stdin: new TextEncoder().encode('piped') },
    { sandboxID: 'two' },
  );

  const files = await readDiskFiles(ctx.root, 'two');

  expect(files).toStrictEqual([['/d/out', 'piped']]);
});

test('it reports the exit code of a command that fails', async () => {
  const ctx = await setupTest();
  const result = await ctx.exec({ argv: ['sh', '-c', 'exit 3'] }, { sandboxID: 'three' });

  expect(result).toMatchObject({ code: 3 });
});

test('it drops the write of a path it is told to lose and reports success', async () => {
  const ctx = await setupTest();

  const result = await ctx.exec(
    { argv: ['sh', '-c', 'cat > "$1"', 'sh', 'lost.txt'], stdin: new TextEncoder().encode('x') },
    { sandboxID: 'four' },
  );

  const files = await readDiskFiles(ctx.root, 'four');

  expect({ code: result.code, files }).toStrictEqual({ code: 0, files: [] });
});
