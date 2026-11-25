import { expect, test } from 'bun:test';
import { readToolRow } from '../rows/read-tool-rows';
import { buildServerFacts } from '../test-utils/build-server-facts';
import { buildToolForm } from '../test-utils/build-tool-form';
import { seedOldAllowProposal } from '../test-utils/seed-old-allow-proposal';
import { startTestMcp } from '../test-utils/start-test-mcp';
import type { ToolForm } from '../types';

async function setupTest() {
  const mcp = await startTestMcp();

  await mcp.addServer('tracker', buildServerFacts());

  return {
    mcp,
    readTool: (tool: string) => readToolRow(mcp.log.writer.db, tool),
    seed: {
      oldAllow: (form: ToolForm) => seedOldAllowProposal(mcp.context, 'tracker', form),
    },
  };
}

test('it refuses to approve a waiting allow for a form the registry refuses, and pins nothing', async () => {
  const ctx = await setupTest();
  const proposalID = await ctx.seed.oldAllow(buildToolForm({ inputSchema: { type: 'string' } }));
  const answered = await ctx.mcp.answer(proposalID, 'approve');
  const tool = await ctx.readTool('tracker.item_get');

  expect(answered).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'form_refused' },
  });

  expect([tool?.state, tool?.pinned_hash]).toStrictEqual(['hidden_new', null]);
});

test('it lets you decline a waiting allow for a form the registry refuses', async () => {
  const ctx = await setupTest();
  const proposalID = await ctx.seed.oldAllow(buildToolForm({ inputSchema: { type: 'string' } }));
  const answered = await ctx.mcp.answer(proposalID, 'decline');

  expect(answered.status).toBe('answered');
});

test('it refuses to approve a waiting allow for a form whose input schema holds an unresolved ref', async () => {
  const ctx = await setupTest();

  const proposalID = await ctx.seed.oldAllow(
    buildToolForm({
      annotations: { readOnlyHint: true },
      inputSchema: { type: 'object', properties: { owner: { $ref: '#/$defs/missing' } } },
    }),
  );

  const answered = await ctx.mcp.answer(proposalID, 'approve');
  const tool = await ctx.readTool('tracker.item_get');

  expect([answered, tool?.state, tool?.pinned_hash]).toStrictEqual([
    { status: 'refused', refusal: { error: 'NOT_ALLOWED', reason: 'form_refused' } },
    'hidden_new',
    null,
  ]);
});
