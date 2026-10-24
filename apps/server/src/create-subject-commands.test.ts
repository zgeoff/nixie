import { expect, mock, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createSubjectCommands } from './create-subject-commands';
import { readCLIArgs } from './read-cli-args';

test('it sends the subjects request to the socket of the config over the host transport it is given', async () => {
  const host = {
    resolveSocketPath: mock(() => Promise.resolve('/run/nixie/control.sock')),
    sendHostRequest: mock().mockResolvedValue({ subjects: 3 }),
  };

  const commands = new Map(createSubjectCommands(host));

  const parsed = await readCLIArgs(
    ['memory-subjects', '--config', '/etc/nixie/config.yaml'],
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
    'memory subjects',
    expect.any(Function),
  );

  expect(io.print).toHaveBeenCalledExactlyOnceWith('{"subjects":3}');
});

test('it runs a dry run with no --database as a refusal, and reaches no server', async () => {
  const host = { resolveSocketPath: mock(), sendHostRequest: mock() };

  const commands = new Map(createSubjectCommands(host));

  const parsed = await readCLIArgs(['memory-subjects', '--dry-run'], [...commands.keys()]);

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie memory-subjects --dry-run takes --database <path> of a nixie.db to copy',
  );

  expect(host.resolveSocketPath).not.toHaveBeenCalled();
  expect(host.sendHostRequest).not.toHaveBeenCalled();
});
