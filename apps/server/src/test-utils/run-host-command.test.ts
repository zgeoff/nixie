import { expect, test } from 'bun:test';
import { runHostCommand } from './run-host-command';

test('it returns the exit code and the stdout of the command run with the configuration given', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', ['memory-pending']);

  expect(run.exitCode).toBe(1);
  expect(run.stdout).toInclude('/nonexistent/config.yaml');
});
