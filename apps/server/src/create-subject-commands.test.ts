import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestMemory } from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { createSubjectCommands } from './create-subject-commands';
import { readCLIArgs } from './read-cli-args';
import { buildRecordingHostTransport } from './test-utils/build-recording-host-transport';
import { startTestControlSocket } from './test-utils/start-test-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-subjects-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const memory = await startTestMemory();

  return { memory, socketPath: join(directory, 'control.sock') };
}

test('it sends the subjects request to the socket of the config over the host transport it is given', async () => {
  const ctx = await setupTest();

  await startTestControlSocket({ path: ctx.socketPath, readMemory: () => ctx.memory.store });

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSubjectCommands(host.transport));

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

  expect(host.record).toStrictEqual({
    configPaths: ['/etc/nixie/config.yaml'],
    requests: [{ socketPath: ctx.socketPath, name: 'memory subjects' }],
  });

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({
      items: { owner: 0, shared: 0, self: 0 },
      proposals: { owner: 0, shared: 0, self: 0 },
    }),
  );
});

test('it runs a dry run with no --database as a refusal, and reaches no server', async () => {
  const ctx = await setupTest();

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSubjectCommands(host.transport));

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

  expect(host.record).toStrictEqual({ configPaths: [], requests: [] });
});
