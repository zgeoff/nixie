import { expect, test } from 'bun:test';
import { runHostCommand } from './run-host-command';

test('it returns the exit code and the stdout of the command', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', ['memory-approve', 'proposal-1']);

  expect(run).toStrictEqual({
    exitCode: 2,
    stdout:
      'nixie memory-approve takes a proposal ID and --hash <action hash>, then --revise <itemID>@<version> or --as-new\n',
  });
});

test('it refuses a revision target with no version before it reads the configuration', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', [
    'memory-approve',
    'proposal-1',
    '--hash',
    'sha256:hash',
    '--revise',
    'item-1',
  ]);

  expect(run.exitCode).toBe(2);
});

test('it passes the configuration given to the command', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', ['memory-pending']);

  expect(run.exitCode).toBe(1);
  expect(run.stdout).toInclude('/nonexistent/config.yaml');
});
