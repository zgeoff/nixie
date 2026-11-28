import { expect, test } from 'bun:test';
import { standInNixieOrigin, startStandInMcp } from '../test-utils/start-stand-in-mcp';

async function setupTest() {
  const logged: { event: string; fields: unknown; level: unknown }[] = [];

  const standIn = await startStandInMcp({
    facts: { privateRange: null },
    logger: (event, fields, level) => {
      logged.push({ event, fields, level });
    },
  });

  await standIn.approveServer();

  return {
    logged,
    connect: () => standIn.mcp.connect('tracker', standInNixieOrigin),
  };
}

test('#connect logs a warning with the server and the reason when discovery fails', async () => {
  const ctx = await setupTest();
  const result = await ctx.connect();

  expect(result.status).toBe('discovery_failed');

  expect(ctx.logged).toStrictEqual([
    {
      event: 'mcp.sign_in_discovery_failed',
      fields: { serverID: 'tracker', reason: expect.stringContaining('not a public address') },
      level: 'warn',
    },
  ]);
});
