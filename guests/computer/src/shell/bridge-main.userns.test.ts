import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildUnshareArgv } from './make-shell-handler';

function setupTest() {
  return {
    run: async (stdin: 'closed' | 'inherit', input: string) => {
      const argv = buildUnshareArgv(
        { bridgeScript: join(import.meta.dir, 'bridge-main.ts'), proxySocketPath: '/nowhere.sock' },
        ['cat'],
        stdin,
      );

      const child = Bun.spawn(argv, { stdin: new Blob([input]), stdout: 'pipe', stderr: 'pipe' });

      const [stdout, exitCode] = await Promise.all([child.stdout.text(), child.exited]);

      return { stdout, exitCode };
    },
  };
}

test('it gives the command the standard input that the bridge was started with when told to inherit', async () => {
  const ctx = setupTest();

  const result = await ctx.run('inherit', 'typed at the terminal');

  expect(result).toStrictEqual({ stdout: 'typed at the terminal', exitCode: 0 });
});

test('it gives the command no standard input when told to close it', async () => {
  const ctx = setupTest();

  const result = await ctx.run('closed', 'never read');

  expect(result).toStrictEqual({ stdout: '', exitCode: 0 });
});
