import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeSessionState } from './remove-session-state';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-codex-purge-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  return { home };
}

test('it removes the sessions, the history and the working directory of the CLI', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.home, '.codex', 'sessions'), { recursive: true });
  await mkdir(join(ctx.home, 'codex-work'), { recursive: true });
  await writeFile(join(ctx.home, '.codex', 'history.jsonl'), 'forgotten');
  await writeFile(join(ctx.home, '.codex', 'sessions', 'rollout.jsonl'), 'forgotten');
  await writeFile(join(ctx.home, 'codex-work', 'image-1.png'), 'forgotten');
  await writeFile(join(ctx.home, 'unrelated.txt'), 'kept');
  await removeSessionState(ctx.home);

  const left = await readdir(ctx.home);

  expect(left).toStrictEqual(['unrelated.txt']);
});

test('it succeeds when there is no state to remove', async () => {
  const ctx = await setupTest();

  await expect(removeSessionState(ctx.home)).toResolve();
});
