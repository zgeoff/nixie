import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRestic } from './run-restic';
import { createStubRestic } from './test-utils/create-stub-restic';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-run-restic-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const restic = await createStubRestic(directory);

  return { directory, restic };
}

test('it hands restic the password in its environment, never in its arguments, and keeps the cache off', async () => {
  const ctx = await setupTest();

  const calls = join(ctx.directory, 'calls.jsonl');

  const result = await runRestic(
    { restic: ctx.restic, backendEnv: { STUB_RESTIC_LOG: calls } },
    { repository: join(ctx.directory, 'keys'), password: 'key-pass' },
    { args: ['init'] },
  );

  const logged = await Bun.file(calls).text();

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });

  expect(logged).toBe(
    `${JSON.stringify({ repository: join(ctx.directory, 'keys'), args: ['--no-cache', 'init'], hasPassword: true })}\n`,
  );
});
