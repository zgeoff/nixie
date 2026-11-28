import { expect, onTestFinished, test } from 'bun:test';
import { makeLogger, startLineLog } from '@heynixie/logger';
import { standInNixieOrigin, startStandInMcp } from '../test-utils/start-stand-in-mcp';

async function setupTest() {
  const lines: string[] = [];

  const lineLog = await startLineLog((line) => {
    lines.push(line);
  });

  onTestFinished(lineLog.stop);

  return { lines, logger: makeLogger() };
}

test('#connect logs a warning with the server ID and no host or address when discovery refuses a private address', async () => {
  const ctx = await setupTest();

  const standIn = await startStandInMcp({
    facts: { privateRange: null },
    logger: ctx.logger,
  });

  await standIn.approveServer();

  const result = await standIn.mcp.connect('tracker', standInNixieOrigin);

  expect(result).toStrictEqual({
    status: 'discovery_failed',
    reason: 'mcp.test resolves to 127.0.0.1, which is not a public address',
  });

  expect(ctx.lines).toHaveLength(1);

  expect(JSON.parse(ctx.lines[0] ?? '')).toMatchObject({
    event: 'mcp.sign_in_discovery_failed',
    level: 'warn',
    serverID: 'tracker',
  });

  expect(ctx.lines[0]).not.toContain('mcp.test');
  expect(ctx.lines[0]).not.toContain('127.0.0.1');
  expect(ctx.lines[0]).not.toContain('public address');
});
