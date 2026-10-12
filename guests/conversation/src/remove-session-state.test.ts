import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeSessionState } from './remove-session-state';

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'nixie-state-'));

  onTestFinished(async () => {
    await chmod(home, 0o700);
    await rm(home, { recursive: true, force: true });
  });

  return { home };
}

test('it removes the config folder and the working directory with every file in them', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.home, '.claude', 'projects', 'conversation'), { recursive: true });
  await writeFile(
    join(ctx.home, '.claude', 'projects', 'conversation', 'session.jsonl'),
    '{"text":"the spare key"}\n',
  );
  await mkdir(join(ctx.home, 'conversation'));
  await removeSessionState(ctx.home);

  const left = await readdir(ctx.home);

  expect(left).toStrictEqual([]);
});

test('it completes when no session state is on disk', async () => {
  const ctx = await setupTest();

  await expect(removeSessionState(ctx.home)).toResolve();
});

test('it never removes a file in the home outside the session state', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.home, 'keep.txt'), 'not session state');
  await mkdir(join(ctx.home, '.claude'));
  await removeSessionState(ctx.home);

  const left = await readdir(ctx.home);

  expect(left).toStrictEqual(['keep.txt']);
});

// root ignores the permission bits these tests set; Bun 1.4.2's skipIf takes a boolean and has no
// in-body skip, so the gate sits at module level
const isRoot = process.getuid?.() === 0;

test.skipIf(isRoot)('it fails when it cannot check that the session state is gone', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.home, '.claude', 'projects'), { recursive: true });
  await writeFile(join(ctx.home, '.claude', 'projects', 'session.jsonl'), '{}\n');

  // a home the guest cannot traverse fails the removal and the check alike
  await chmod(ctx.home, 0o000);

  expect(removeSessionState(ctx.home)).rejects.toMatchObject({ code: 'EACCES' });
});

test.skipIf(isRoot)(
  'it fails when the session state is still on disk after the removal',
  async () => {
    const ctx = await setupTest();

    await mkdir(join(ctx.home, '.claude', 'projects'), { recursive: true });
    await writeFile(join(ctx.home, '.claude', 'projects', 'session.jsonl'), '{}\n');

    // a home the guest cannot write keeps its entries, as a removal that failed would
    await chmod(ctx.home, 0o500);

    expect(removeSessionState(ctx.home)).rejects.toThrow('the session state is still on disk');
  },
);
