import { expect, test } from 'bun:test';
import { runHostCommand } from './run-host-command';

test('it returns the exit code and the stdout of the command', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', ['memory-approve', 'proposal-1']);

  expect(run).toStrictEqual({
    exitCode: 2,
    stdout: 'nixie memory-approve takes a proposal ID and --hash <action hash>\n',
  });
});

test('it passes the configuration given to the command', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', ['memory-pending']);

  expect(run.exitCode).toBe(1);
  expect(run.stdout).toInclude('/nonexistent/config.yaml');
});
