import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRecordingHostTransport } from './build-recording-host-transport';
import { startTestControlSocket } from './start-test-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-transport-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { socketPath: join(directory, 'control.sock') };
}

test('it resolves every config to its socket, and records the config path', async () => {
  const ctx = await setupTest();

  const recording = buildRecordingHostTransport(ctx.socketPath);

  const socketPath = await recording.transport.resolveSocketPath('/etc/nixie/config.yaml');

  expect(socketPath).toBe(ctx.socketPath);
  expect(recording.record.configPaths).toStrictEqual(['/etc/nixie/config.yaml']);
});

test('it sends a request to the control socket, and records its socket and name', async () => {
  const ctx = await setupTest();

  await startTestControlSocket({ path: ctx.socketPath });

  const recording = buildRecordingHostTransport(ctx.socketPath);

  const pending = await recording.transport.sendHostRequest(
    ctx.socketPath,
    'skill pending',
    (client) => client.skills.proposals.list(),
  );

  expect(pending).toStrictEqual([]);

  expect(recording.record.requests).toStrictEqual([
    { socketPath: ctx.socketPath, name: 'skill pending' },
  ]);
});

test('it records nothing before a call', async () => {
  const ctx = await setupTest();

  const recording = buildRecordingHostTransport(ctx.socketPath);

  expect(recording.record).toStrictEqual({ configPaths: [], requests: [] });
});
