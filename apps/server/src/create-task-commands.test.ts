import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { createTaskCommands } from './create-task-commands';
import { readCLIArgs } from './read-cli-args';
import { buildRecordingHostTransport } from './test-utils/build-recording-host-transport';
import { startTestControlSocket } from './test-utils/start-test-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-task-commands-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { socketPath: join(directory, 'control.sock') };
}

test('it offers one command for each task control', () => {
  const host = buildRecordingHostTransport('/run/nixie/control.sock');
  const commands = createTaskCommands(host.transport).map(([name]) => name);

  expect(commands).toStrictEqual([
    'task-pause',
    'task-resume',
    'task-stop',
    'task-restart',
    'task-close',
    'task-interrupt',
  ]);
});

test('it stops the task it names over the host transport and prints the task state', async () => {
  const ctx = await setupTest();
  const api = await startTestControlSocket({ path: ctx.socketPath });
  const taskID = await createTask(api.context, 'sort the receipts');

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createTaskCommands(host.transport));

  const parsed = await readCLIArgs(
    ['task-stop', taskID, '--config', '/etc/nixie/config.yaml'],
    [...commands.keys()],
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
    requests: [{ socketPath: ctx.socketPath, name: 'task stop' }],
  });

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ taskID, state: 'stopped', isPauseRequested: false }),
  );
});
