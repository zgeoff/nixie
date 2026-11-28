import { expect, test } from 'bun:test';
import { readListedTools } from './read-listed-tools';
import { startStandInMcp } from './start-stand-in-mcp';

test('it lists an allowed tool through the endpoint', async () => {
  const ctx = await startStandInMcp({
    tools: [
      {
        name: 'item_get',
        description: 'Read one item.',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true },
      },
    ],
  });

  await ctx.approveServer();
  await ctx.signIn(ctx.mcp);
  await ctx.mcp.tools.refresh();

  const listed = await readListedTools(ctx, ['tracker.item_get']);

  expect(listed).toStrictEqual([{ name: 'tracker.item_get', description: 'Read one item.' }]);
});
