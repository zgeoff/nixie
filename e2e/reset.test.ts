import { expect, test } from 'bun:test';
import { createTestClient, runHostCommand } from '@heynixie/server/test-utils';
import { startSpawnedNixie } from './test-utils/start-spawned-nixie';

test('it resets the running server through the reset command, which exits 0 with the server, and starts again', async () => {
  const nixie = await startSpawnedNixie();

  const server = nixie.harness.start();

  await createTestClient(server);

  const command = await runHostCommand(nixie.configPath, ['reset', '--keep-sessions', '--yes']);
  const finished = await server.waitForLogEvent('reset.finished');
  const serverExit = await server.exited;

  const again = nixie.harness.start();

  const ready = await again.waitForLogEvent('ready');

  expect(command.exitCode).toBe(0);

  expect(command.stdout).toInclude(
    'Backups from before the reset still hold the old data until they age out.',
  );

  expect(finished['lastSequence']).toBeNumber();
  expect(serverExit).toStrictEqual({ code: 0, signal: null });
  expect(ready).toMatchObject({ event: 'ready' });
});
