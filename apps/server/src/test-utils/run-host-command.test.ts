import { expect, test } from 'bun:test';
import { runHostCommand } from './run-host-command';

test('it returns the exit code, the printed text and the logged events of the command run with the configuration given', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', ['memory-pending']);

  expect(run.exitCode).toBe(1);
  expect(run.stdout).toBe('');

  expect(run.logged).toMatchObject([
    {
      event: 'command.failed',
      command: 'memory-pending',
      message: expect.toInclude('/nonexistent/config.yaml'),
    },
  ]);
});

test('it prints the refusal of a command that lacks its argument', async () => {
  const run = await runHostCommand('/nonexistent/config.yaml', ['memory-show']);

  expect(run).toStrictEqual({
    exitCode: 2,
    stdout: 'nixie memory-show takes an item ID\n',
    logged: [],
  });
});
