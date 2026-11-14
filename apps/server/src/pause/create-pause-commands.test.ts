import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { readCLIArgs } from '../cli/read-cli-args';
import { buildRecordingHostTransport } from '../test-utils/build-recording-host-transport';
import { startTestControlSocket } from '../test-utils/start-test-control-socket';
import { createPauseCommands } from './create-pause-commands';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-pause-commands-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const socketPath = join(directory, 'control.sock');

  await startTestControlSocket({ path: socketPath });

  const host = buildRecordingHostTransport(socketPath);

  const commands = new Map(createPauseCommands(host.transport));

  return {
    host,
    socketPath,
    commandNames: [...commands.keys()],
    runCommand: async (argv: readonly string[]) => {
      const parsed = await readCLIArgs(argv, [...commands.keys()]);

      invariant(parsed.kind === 'command');

      const run = commands.get(parsed.command);

      invariant(run);

      const io = { log: mock(), print: mock(), waitForSignal: mock() };

      const exitCode = await run(parsed.flags, io, parsed.args);

      return { exitCode, io };
    },
  };
}

test('it offers a command to pause, to resume and to read the last restore', async () => {
  const ctx = await setupTest();

  expect(ctx.commandNames).toStrictEqual(['pause', 'resume', 'recovery']);
});

test('it pauses nixie over the host transport and prints the pause state', async () => {
  const ctx = await setupTest();
  const run = await ctx.runCommand(['pause', '--config', '/etc/nixie/config.yaml']);

  expect(run.exitCode).toBe(0);

  expect(ctx.host.record).toStrictEqual({
    configPaths: ['/etc/nixie/config.yaml'],
    requests: [{ socketPath: ctx.socketPath, name: 'nixie pause' }],
  });

  expect(run.io.print).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^\{"paused":\{"cause":"owner","since":"\d{4}-[^"]+"\}\}$/u),
  );
});

test('it resumes nixie and prints that no pause holds', async () => {
  const ctx = await setupTest();

  await ctx.runCommand(['pause']);

  const run = await ctx.runCommand(['resume']);

  expect(run.exitCode).toBe(0);
  expect(run.io.print).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ paused: null }));
});

test('it prints no recovery before any restore', async () => {
  const ctx = await setupTest();
  const run = await ctx.runCommand(['recovery']);

  expect(run.exitCode).toBe(0);
  expect(run.io.print).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ recovery: null }));
});
