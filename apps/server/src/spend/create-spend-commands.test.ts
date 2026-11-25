import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { readCLIArgs } from '../cli/read-cli-args';
import { buildRecordingHostTransport } from '../test-utils/build-recording-host-transport';
import { startTestControlSocket } from '../test-utils/start-test-control-socket';
import { createSpendCommands } from './create-spend-commands';

interface TestOptions {
  readonly isSpendOn: boolean;
}

async function setupTest(options: TestOptions) {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-spend-commands-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const socketPath = join(directory, 'control.sock');

  await startTestControlSocket({ path: socketPath, isSpendOn: options.isSpendOn });

  const host = buildRecordingHostTransport(socketPath);

  const commands = new Map(createSpendCommands(host.transport));

  return {
    host,
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

test('it raises the turns of today over the host transport and prints the turns in force', async () => {
  const ctx = await setupTest({ isSpendOn: true });
  const run = await ctx.runCommand(['spend', 'raise', '--turns', '9']);

  expect(run.exitCode).toBe(0);

  expect(run.io.print).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^\{"start":"\d{4}-\d{2}-\d{2}","turns":9\}$/u),
  );
});

test.each([
  { name: 'no turns', argv: ['spend', 'raise'] },
  { name: 'zero turns', argv: ['spend', 'raise', '--turns', '0'] },
  { name: 'a fraction of a turn', argv: ['spend', 'raise', '--turns', '1.5'] },
])('it refuses $name and sends nothing', async (row) => {
  const ctx = await setupTest({ isSpendOn: true });
  const run = await ctx.runCommand(row.argv);

  expect([run.exitCode, ctx.host.record.requests]).toStrictEqual([1, []]);
});

test('it fails when the config sets no spendStop', async () => {
  const ctx = await setupTest({ isSpendOn: false });

  const run = ctx.runCommand(['spend', 'raise', '--turns', '9']);

  await Promise.allSettled([run]);

  expect(run).rejects.toThrow();
});
