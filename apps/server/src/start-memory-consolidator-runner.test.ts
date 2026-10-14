import { expect, onTestFinished, test } from 'bun:test';
import { consolidationConfigSchema } from '@heynixie/memory';
import { createMemoryItem } from '@heynixie/memory/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import { buildTestClock, startScriptedModel } from '@heynixie/testing';
import { startMemoryConsolidatorRunner } from './start-memory-consolidator-runner';
import { runTaskSteps } from './test-utils/run-task-steps';
import { startTestMemoryStore } from './test-utils/start-test-memory-store';
import { startTestServer } from './test-utils/start-test-server';

// memory on a test server and a test clock, with the consolidator on its own scripted model and
// the process double, which runs the real guest against the consolidator's tool endpoint
async function setupTest() {
  const server = await startTestServer();
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));
  const context = { ...server.context, clock };
  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const store = await startTestMemoryStore(context, () => Promise.resolve());
  const consolidator = await startMemoryConsolidatorRunner({
    context,
    models: modelsConfigSchema.parse({
      profiles: {
        'tidy-direct': {
          base_url: model.url,
          credential: 'deployment:anthropic',
          auth_header: 'x-api-key',
          model: 'claude-test-1',
          effort: 'low',
        },
      },
      roles: { conversation: 'tidy-direct', 'memory-consolidator': 'tidy-direct' },
    }),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: server.sandboxes,
    socketDir: `${server.dataDir}/tools`,
    image: 'nixie-conversation-0123456789ab',
    store,
    config: consolidationConfigSchema.parse({}),
    getPersona: () => '',
    onError: (error) => {
      throw error;
    },
  });

  server.defer(() => consolidator.stop());
  return {
    model,
    store,
    run: () =>
      runTaskSteps(context, {
        steps: { 'memory-consolidator': consolidator.runStep },
        advance: (ms) => {
          clock.advance(ms);
        },
        isDone: async () => (await store.consolidations.readPending()) !== null,
        maxSteps: 5,
      }),
  };
}

test('it runs a session over the active items and leaves the diff its model proposed through the tool for your review', async () => {
  const ctx = await setupTest();
  const [allergy, duplicate, stale] = await Promise.all([
    createMemoryItem(ctx.store, { text: 'Is allergic to peanuts' }),
    createMemoryItem(ctx.store, { text: 'has peanut allergy', origin: 'memory_writer' }),
    createMemoryItem(ctx.store, { text: 'Has a dentist appointment on 2026-03-02' }),
  ]);

  ctx.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_consolidate',
        input: {
          changes: [
            {
              kind: 'merge',
              itemIDs: [allergy.itemID, duplicate.itemID],
              text: 'Is allergic to peanuts',
              reason: 'Both items state the same allergy.',
            },
            { kind: 'retire', itemIDs: [stale.itemID], reason: 'The appointment has passed.' },
          ],
        },
      },
    },
    { text: 'done' },
  );
  await ctx.run();

  const diff = await ctx.store.consolidations.readPending();

  expect(diff).toMatchObject({
    model: 'claude-test-1',
    changes: [
      {
        kind: 'merge',
        inputs: [
          { ...allergy, isCurrent: true },
          { ...duplicate, isCurrent: true },
        ],
        text: 'Is allergic to peanuts',
      },
      { kind: 'retire', inputs: [{ ...stale, isCurrent: true }], text: null },
    ],
  });
}, 60_000);

test('it gives the session only recall and consolidate', async () => {
  const ctx = await setupTest();

  await Promise.all([
    createMemoryItem(ctx.store, { text: 'Keeps bees on the roof' }),
    createMemoryItem(ctx.store, { text: 'Sings in a choir' }),
  ]);
  ctx.model.addReplies({
    toolUse: { name: 'mcp__nixie__memory_consolidate', input: { changes: [] } },
  });
  ctx.model.addReplies({ text: 'done' });
  await ctx.run();

  const tools = ctx.model.requests[0]?.body?.tools?.map((tool) => tool.name);

  expect(tools).toIncludeAllMembers([
    'mcp__nixie__memory_recall',
    'mcp__nixie__memory_consolidate',
  ]);
  expect(tools?.filter((name) => name.startsWith('mcp__nixie__'))).toHaveLength(2);
}, 60_000);
