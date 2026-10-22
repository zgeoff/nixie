import { expect, test } from 'bun:test';
import { createTestClient, runHostCommand, spawnTestNixie } from '@heynixie/server/test-utils';

test('it resets the running server through the reset command, which exits 0 with the server, and starts again', async () => {
  const nixie = await spawnTestNixie();

  await createTestClient(nixie);

  const command = await runHostCommand(nixie.configPath, ['reset', '--keep-sessions', '--yes']);
  const finished = await nixie.waitForLogEvent('reset.finished');
  const serverExit = await nixie.exited;

  const again = nixie.startAgain();

  const ready = await again.waitForLogEvent('ready');

  expect(command.exitCode).toBe(0);

  expect(command.stdout).toInclude(
    'Backups from before the reset still hold the old data until they age out.',
  );

  expect(finished['lastSequence']).toBeNumber();
  expect(serverExit).toBe(0);
  expect(ready).toMatchObject({ event: 'ready' });
});
