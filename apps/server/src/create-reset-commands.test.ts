import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { createResetCommands } from './create-reset-commands';
import { readCLIArgs } from './read-cli-args';
import { buildRecordingHostTransport } from './test-utils/build-recording-host-transport';
import { startTestControlSocket } from './test-utils/start-test-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-reset-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { socketPath: join(directory, 'control.sock') };
}

test('it sends the reset over the host transport it is given, and prints what the reset kept', async () => {
  const ctx = await setupTest();

  await startTestControlSocket({
    path: ctx.socketPath,
    runReset: () =>
      Promise.resolve({
        lastSequence: 42,
        resetAt: new Date('2026-03-03T10:00:00Z'),
        keptSessions: 2,
      }),
  });

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createResetCommands(host.transport));

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

  expect(host.record).toStrictEqual({
    configPaths: ['/etc/nixie/config.yaml'],
    requests: [{ socketPath: ctx.socketPath, name: 'reset' }],
  });

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    [
      'nixie removed the log up to sequence 42 at 2026-03-03T10:00:00.000Z and kept 2 device sessions signed in.',
      'The server restarts now, and its next turn starts with no history.',
      'Backups from before the reset still hold the old data until they age out.',
    ].join('\n'),
  );
});

test('it refuses a reset with no --yes, and reaches no server', async () => {
  const ctx = await setupTest();

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createResetCommands(host.transport));

  const parsed = await readCLIArgs(['reset', '--keep-sessions'], [...commands.keys()]);

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);
  expect(host.record).toStrictEqual({ configPaths: [], requests: [] });
});
