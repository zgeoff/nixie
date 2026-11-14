import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupTurnDisk } from './setup-turn-disk';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-turn-disk-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  return { home };
}

test('it creates the working directory and keeps only the session the turn resumes', async () => {
  const ctx = await setupTest();

  const projectDir = join(ctx.home, '.claude', 'projects', '-home-nixie-conversation');

  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'aaaa.jsonl'), '{}\n');
  await writeFile(join(projectDir, 'bbbb.jsonl'), '{}\n');

  await setupTurnDisk(
    {
      cwd: join(ctx.home, 'conversation'),
      env: { CLAUDE_CONFIG_DIR: join(ctx.home, '.claude') },
    },
    'bbbb',
  );

  const workDir = await stat(join(ctx.home, 'conversation'));
  const sessions = await readdir(projectDir);

  expect(workDir.isDirectory()).toBe(true);
  expect(sessions).toStrictEqual(['bbbb.jsonl']);
});
