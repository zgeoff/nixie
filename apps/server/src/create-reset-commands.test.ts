import { expect, mock, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createResetCommands } from './create-reset-commands';
import { readCLIArgs } from './read-cli-args';

test('it sends the reset over the host transport it is given, and prints what the reset kept', async () => {
  const host = {
    resolveSocketPath: mock(() => Promise.resolve('/run/nixie/control.sock')),
    sendHostRequest: mock().mockResolvedValue({
      lastSequence: 42,
      resetAt: new Date('2026-03-03T10:00:00Z'),
      keptSessions: 2,
    }),
  };

  const commands = new Map(createResetCommands(host));

  const parsed = await readCLIArgs(
    ['reset', '--keep-sessions', '--yes', '--config', '/etc/nixie/config.yaml'],
    [...commands.keys()],
  );

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(0);
  expect(host.resolveSocketPath).toHaveBeenCalledExactlyOnceWith('/etc/nixie/config.yaml');

  expect(host.sendHostRequest).toHaveBeenCalledExactlyOnceWith(
    '/run/nixie/control.sock',
    'reset',
    expect.any(Function),
  );

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    [
      'nixie removed the log up to sequence 42 at 2026-03-03T10:00:00.000Z and kept 2 device sessions signed in.',
      'The server restarts now, and its next turn starts with no history.',
      'Backups from before the reset still hold the old data until they age out.',
    ].join('\n'),
  );
});

test('it refuses a reset with no --yes, and reaches no server', async () => {
  const host = { resolveSocketPath: mock(), sendHostRequest: mock() };

  const commands = new Map(createResetCommands(host));

  const parsed = await readCLIArgs(['reset', '--keep-sessions'], [...commands.keys()]);

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);
  expect(host.resolveSocketPath).not.toHaveBeenCalled();
  expect(host.sendHostRequest).not.toHaveBeenCalled();
});
