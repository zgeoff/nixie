import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTerminalTextReader } from './make-terminal-text-reader';

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'terminal-log-'));

  onTestFinished(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  const path = join(folder, 'terminal.log');

  return { path, readText: makeTerminalTextReader(path) };
}

test('it reads the visible lines from the end of the log', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, '$ ls\r\nnotes.md\r\n$ ');

  const text = await ctx.readText();

  expect(text).toBe('$ ls\nnotes.md\n$');
});

test('it reads nothing from a log that does not exist', async () => {
  const ctx = await setupTest();
  const text = await ctx.readText();

  expect(text).toBe('');
});

test('it reads only the end of a log past the tail size', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, `${'x'.repeat(200_000)}\nlast line\n`);

  const text = await ctx.readText();

  expect(text.endsWith('last line')).toBe(true);
});

test('it reads nothing from a log that is a link to another file', async () => {
  const ctx = await setupTest();

  const target = `${ctx.path}.target`;

  await writeFile(target, 'secret text\n');
  await symlink(target, ctx.path);

  const text = await ctx.readText();

  expect(text).toBe('');
});

test('it reads nothing from a log that is a pipe, and does not wait on it', async () => {
  const ctx = await setupTest();

  await Bun.$`mkfifo ${ctx.path}`.quiet();

  const text = await ctx.readText();

  expect(text).toBe('');
});
