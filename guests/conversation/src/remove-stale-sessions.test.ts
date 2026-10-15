import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeStaleSessions } from './remove-stale-sessions';

// a config folder with one project folder for the guest's working directory
async function setupTest() {
  const configDir = await mkdtemp(join(tmpdir(), 'nixie-sessions-'));

  onTestFinished(() => rm(configDir, { recursive: true, force: true }));

  const projectDir = join(configDir, 'projects', '-home-nixie-conversation');

  await mkdir(projectDir, { recursive: true });

  return { configDir, projectDir };
}

test('it removes every session but the one the turn resumes, with its side files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.projectDir, 'aaaa.jsonl'), '{}\n');
  await writeFile(join(ctx.projectDir, 'bbbb.jsonl'), '{}\n');
  await mkdir(join(ctx.projectDir, 'aaaa'));
  await mkdir(join(ctx.projectDir, 'bbbb'));
  await removeStaleSessions(ctx.configDir, 'bbbb');

  const left = await readdir(ctx.projectDir);

  expect(left).toIncludeSameMembers(['bbbb', 'bbbb.jsonl']);
});

test('it removes every session when the turn starts a fresh one', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.projectDir, 'aaaa.jsonl'), '{}\n');
  await removeStaleSessions(ctx.configDir, null);

  const left = await readdir(ctx.projectDir);

  expect(left).toStrictEqual([]);
});

test('it removes nothing outside the config folder when no config folder is set', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.projectDir, 'aaaa.jsonl'), '{}\n');
  await removeStaleSessions(undefined, null);

  const left = await readdir(ctx.projectDir);

  expect(left).toStrictEqual(['aaaa.jsonl']);
});

test('it does nothing before the SDK wrote its first session', async () => {
  const configDir = await mkdtemp(join(tmpdir(), 'nixie-sessions-'));

  onTestFinished(() => rm(configDir, { recursive: true, force: true }));

  await removeStaleSessions(configDir, null);

  const left = await readdir(configDir);

  expect(left).toStrictEqual([]);
});
