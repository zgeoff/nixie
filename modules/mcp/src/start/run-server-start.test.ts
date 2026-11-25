import { expect, test } from 'bun:test';
import { readOpenProposals } from '@heynixie/proposals';
import { readServerRows } from '../rows/read-server-rows';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { startTestMcp } from '../test-utils/start-test-mcp';
import { runServerStart } from './run-server-start';

async function setupTest() {
  const mcp = await startTestMcp();

  return {
    mcp,
    start: (config: Parameters<typeof runServerStart>[1]['config']) =>
      runServerStart(mcp.context, { config, forgetCredentials: () => Promise.resolve() }),
    readServer: async (serverID: string) => {
      const rows = await readServerRows(mcp.log.writer.db);

      return rows.find((row) => row.server_id === serverID) ?? null;
    },
    readOpen: () => readOpenProposals(mcp.log.writer.db, mcp.context.now()),
  };
}

test('it holds a widened server and makes one proposal, however often the server starts', async () => {
  const ctx = await setupTest();

  const widened = buildServerFacts({ scope: 'read write admin' });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.start({ tracker: widened });
  await ctx.start({ tracker: widened });

  const server = await ctx.readServer('tracker');
  const open = await ctx.readOpen();

  expect([server?.state, server?.scope, open.length]).toStrictEqual(['held', 'read write', 1]);
});

test('it applies a narrowed server at once with no proposal', async () => {
  const ctx = await setupTest();

  const narrowed = buildServerFacts({ scope: 'read' });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.start({ tracker: narrowed });

  const server = await ctx.readServer('tracker');
  const open = await ctx.readOpen();

  expect([server?.state, server?.scope, open.length]).toStrictEqual(['added', 'read', 0]);
});

test('it holds the server until you approve the widening, and then it uses the new facts', async () => {
  const ctx = await setupTest();

  const widened = buildServerFacts({ scope: 'read write admin' });

  await ctx.mcp.addServer('tracker', buildServerFacts());
  await ctx.start({ tracker: widened });

  const held = await ctx.readServer('tracker');

  await ctx.mcp.answer(held?.proposal_id ?? '', 'approve');

  const approved = await ctx.readServer('tracker');

  expect([approved?.state, approved?.scope]).toStrictEqual(['added', 'read write admin']);
});
