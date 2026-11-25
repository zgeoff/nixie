import { expect, test } from 'bun:test';
import { runHostCommand } from '../test-utils/run-host-command';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  await nixie.waitForLogEvent('ready');

  return nixie;
}

test('it refuses to allow a tool that no server listed, and names the reason', async () => {
  const ctx = await setupTest();
  const allowed = await runHostCommand(ctx.configPath, ['mcp', 'allow', 'tracker.item_get']);

  expect([allowed.exitCode, allowed.logged]).toMatchObject([
    1,
    [{ event: 'command.failed', message: expect.stringContaining('No MCP tool has this name') }],
  ]);
});

test('it takes the tool name as the one argument of allow', async () => {
  const ctx = await setupTest();
  const allowed = await runHostCommand(ctx.configPath, ['mcp', 'allow']);

  expect(allowed.exitCode).not.toBe(0);
});
