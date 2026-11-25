import { expect, test } from 'bun:test';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { createToolCatalog } from './create-tool-catalog';

async function setupTest() {
  const mcp = await startTestMcp();

  return { mcp, catalog: createToolCatalog(mcp.log) };
}

test('it registers an allowed tool as the server ID, a dot and the tool name', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item_get' })] });
  await ctx.mcp.allow('tracker.item_get');
  await ctx.catalog.refresh();

  expect([
    ctx.catalog.toolNames(),
    ctx.catalog.findTool('tracker.item_get')?.definition.name,
  ]).toStrictEqual([['tracker.item_get'], 'tracker.item_get']);
});

test('it never registers a tool that has no pin', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item_get' })] });
  await ctx.catalog.refresh();

  expect([ctx.catalog.toolNames(), ctx.catalog.findTool('tracker.item_get')]).toStrictEqual([
    [],
    null,
  ]);
});

test('it keeps a tool whose name the model cannot read out of the registry', async () => {
  const ctx = await setupTest();

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.mcp.list('tracker', { forms: [buildToolForm({ name: 'item get!' })] });
  await ctx.catalog.refresh();

  expect(ctx.catalog.toolNames()).toStrictEqual([]);
});
