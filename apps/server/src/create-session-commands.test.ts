import { expect, mock, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createSessionCommands } from './create-session-commands';
import { readCLIArgs } from './read-cli-args';

test('it prints the enrolment code that the host transport it is given answers with', async () => {
  const host = {
    resolveSocketPath: mock(() => Promise.resolve('/run/nixie/control.sock')),
    sendHostRequest: mock().mockResolvedValue({
      code: 'K3X9-M2P7',
      expiresAt: new Date('2026-03-03T10:15:00Z'),
    }),
  };

  const commands = new Map(createSessionCommands(host));

  const parsed = await readCLIArgs(
    ['enrol-code', '--config', '/etc/nixie/config.yaml'],
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
    'enrolment code',
    expect.any(Function),
  );

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    'K3X9-M2P7\nThe code works once, until 2026-03-03T10:15:00.000Z.',
  );
});

test('it refuses a session label with no label, and reaches no server', async () => {
  const host = { resolveSocketPath: mock(), sendHostRequest: mock() };

  const commands = new Map(createSessionCommands(host));

  const parsed = await readCLIArgs(['session-label', 'session-1'], [...commands.keys()]);

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    'nixie session-label takes a session ID and a label',
  );

  expect(host.resolveSocketPath).not.toHaveBeenCalled();
  expect(host.sendHostRequest).not.toHaveBeenCalled();
});
