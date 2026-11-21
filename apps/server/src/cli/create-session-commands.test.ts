import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { APITables } from '@heynixie/api';
import invariant from 'tiny-invariant';
import { buildRecordingHostTransport } from '../test-utils/build-recording-host-transport';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestControlSocket } from '../test-utils/start-test-control-socket';
import { createSessionCommands } from './create-session-commands';
import { readCLIArgs } from './read-cli-args';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-sessions-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { socketPath: join(directory, 'control.sock') };
}

test('it prints the enrolment code that the host transport it is given answers with', async () => {
  const ctx = await setupTest();

  await startTestControlSocket({ path: ctx.socketPath });

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSessionCommands(host.transport));

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

  expect(host.record).toStrictEqual({
    configPaths: ['/etc/nixie/config.yaml'],
    requests: [{ socketPath: ctx.socketPath, name: 'enrolment code' }],
  });

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    expect.stringMatching(/^\S+\nThe code works once, until \d{4}-\d{2}-\d{2}T[\d:.]+Z\.$/u),
  );
});

test('it lists the device sessions over the host transport it is given', async () => {
  const ctx = await setupTest();
  const api = await startTestControlSocket({ path: ctx.socketPath });
  const session = await buildSeeder(api).identity({ deviceName: 'Kitchen tablet' });

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSessionCommands(host.transport));

  const parsed = await readCLIArgs(
    ['sessions', '--config', '/etc/nixie/config.yaml'],
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
    requests: [{ socketPath: ctx.socketPath, name: 'session list' }],
  });

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    expect.toSatisfy((printed: string) =>
      printed.includes(`"sessionID":"${session.sessionID}","deviceName":"Kitchen tablet"`),
    ),
  );
});

test('it labels a device session over the host transport it is given', async () => {
  const ctx = await setupTest();
  const api = await startTestControlSocket({ path: ctx.socketPath });
  const session = await buildSeeder(api).identity({ deviceName: 'Kitchen tablet' });

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSessionCommands(host.transport));

  const parsed = await readCLIArgs(
    ['session-label', session.sessionID, 'Hall', 'tablet', '--config', '/etc/nixie/config.yaml'],
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
    requests: [{ socketPath: ctx.socketPath, name: 'session label' }],
  });

  expect(io.print).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ sessionID: session.sessionID, label: 'Hall tablet' }),
  );
});

test('it refuses a session label with no label, and reaches no server', async () => {
  const ctx = await setupTest();

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSessionCommands(host.transport));

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

  expect(host.record).toStrictEqual({ configPaths: [], requests: [] });
});

test('it issues a code for a device when the word device follows', async () => {
  const ctx = await setupTest();
  const api = await startTestControlSocket({ path: ctx.socketPath });

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSessionCommands(host.transport));

  const parsed = await readCLIArgs(
    ['enrol-code', 'device', '--config', '/etc/nixie/config.yaml'],
    [...commands.keys()],
  );

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  const codes = await api.context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('enrolment_codes')
    .select('scope')
    .execute();

  expect(exitCode).toBe(0);
  expect(codes).toStrictEqual([{ scope: 'device' }]);
});

test('it refuses a word other than device after enrol-code', async () => {
  const ctx = await setupTest();

  await startTestControlSocket({ path: ctx.socketPath });

  const host = buildRecordingHostTransport(ctx.socketPath);

  const commands = new Map(createSessionCommands(host.transport));

  const parsed = await readCLIArgs(
    ['enrol-code', 'camera', '--config', '/etc/nixie/config.yaml'],
    [...commands.keys()],
  );

  invariant(parsed.kind === 'command');

  const run = commands.get(parsed.command);

  invariant(run);

  const io = { log: mock(), print: mock(), waitForSignal: mock() };

  const exitCode = await run(parsed.flags, io, parsed.args);

  expect(exitCode).toBe(2);
  expect(host.record.requests).toStrictEqual([]);
});
