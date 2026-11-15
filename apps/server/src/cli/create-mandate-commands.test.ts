import { expect, test } from 'bun:test';
import { runHostCommand } from '../test-utils/run-host-command';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  return nixie;
}

test('it lists no mandate when none is active', async () => {
  const ctx = await setupTest();
  const listed = await runHostCommand(ctx.configPath, ['mandates', 'list']);

  expect({ exitCode: listed.exitCode, stdout: listed.stdout.trim() }).toStrictEqual({
    exitCode: 0,
    stdout: '[]',
  });
});

test('it refuses to end a mandate that no one proposed', async () => {
  const ctx = await setupTest();
  const ended = await runHostCommand(ctx.configPath, ['mandates', 'end', 'missing']);

  expect(ended.exitCode).not.toBe(0);
});
