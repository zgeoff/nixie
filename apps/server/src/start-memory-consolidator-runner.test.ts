import { expect, onTestFinished, test } from 'bun:test';
import { consolidationConfigSchema } from '@heynixie/memory';
import { createMemoryItem } from '@heynixie/memory/test-utils';
import { modelsConfigSchema } from '@heynixie/models';
import type { ScriptedReply } from '@heynixie/testing';
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
    models: buildModelsConfig(model.url),
    secrets: { model_credentials: { anthropic: 'not-a-real-key' } },
    sandboxes: server.sandboxes,
    socketDir: `${server.dataDir}/tools`,
    image: 'nixie-conversation-0123456789ab',
    store,
    config: consolidationConfigSchema.parse({}),
    getPersona: () => '',
    ownerName: 'Marisol',
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

// one profile on the scripted model, which the conversation and the consolidator share
function buildModelsConfig(url: string) {
  return modelsConfigSchema.parse({
    profiles: {
      'tidy-direct': {
        base_url: url,
        credential: 'deployment:anthropic',
        auth_header: 'x-api-key',
        model: 'claude-test-1',
        effort: 'low',
      },
    },
    roles: { conversation: 'tidy-direct', 'memory-consolidator': 'tidy-direct' },
  });
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

test("it shows the session the owner's name and each item's quote under its text", async () => {
  const ctx = await setupTest();

  await Promise.all([
    createMemoryItem(ctx.store, {
      text: 'The owner says mondays are the wet sock of the week',
      quote: 'mondays are the wet sock of the week, every single time',
    }),
    createMemoryItem(ctx.store, { text: 'Sings in a choir' }),
  ]);
  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_consolidate', input: { changes: [] } } },
    { text: 'done' },
  );
  await ctx.run();

  const [first] = ctx.model.requests;

  expect(JSON.stringify(first?.body?.system)).toInclude("You read Marisol's current memory items");
  expect(JSON.stringify(first?.body?.messages)).toInclude(
    String.raw`: The owner says mondays are the wet sock of the week\n  quote: mondays are the wet sock of the week, every single time\n- `,
  );
}, 60_000);

test('it carries an idiom word for word, a pronoun through a merge, and a summary of 2 conflicting items it left alone', async () => {
  const ctx = await setupTest();
  const [mondays, sister, piano, oat, black] = await Promise.all([
    createMemoryItem(ctx.store, { text: 'The owner says mondays are the wet sock of the week' }),
    createMemoryItem(ctx.store, { text: 'Her sister Wren lives in Galway' }),
    createMemoryItem(ctx.store, { text: 'Wren teaches piano, she started last spring' }),
    createMemoryItem(ctx.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.store, { text: 'Takes coffee black, no milk' }),
  ]);

  ctx.model.addReplies(
    buildInventedDiff({ rewrite: mondays.itemID, merge: [sister.itemID, piano.itemID] }),
    { text: 'done' },
  );
  await ctx.run();

  const diff = await ctx.store.consolidations.readPending();

  expect(JSON.stringify(ctx.model.requests[1]?.body?.messages)).toInclude(
    String.raw`"type":"tool_result","content":"{\"staged\":2}"`,
  );
  expect(diff?.changes).toMatchObject([
    {
      kind: 'rewrite',
      inputs: [{ ...mondays, isCurrent: true }],
      text: 'Marisol says mondays are the wet sock of the week',
    },
    {
      kind: 'merge',
      inputs: [
        { ...sister, isCurrent: true },
        { ...piano, isCurrent: true },
      ],
      text: 'Her sister Wren lives in Galway, and she teaches piano, which she started last spring',
    },
  ]);
  expect(
    diff?.changes.flatMap((change) => change.inputs.map((input) => input.itemID)),
  ).not.toIncludeAnyMembers([oat.itemID, black.itemID]);
}, 60_000);

// the item the invented diff rewrites, and the items it merges
interface InventedDiffItems {
  readonly rewrite: string;
  readonly merge: readonly string[];
}

// the scripted call that proposes the invented diff: a rewrite that only names the owner, a merge
// that keeps "she", and a summary of the 2 coffee items it leaves alone
function buildInventedDiff(itemIDs: InventedDiffItems): ScriptedReply {
  return {
    toolUse: {
      name: 'mcp__nixie__memory_consolidate',
      input: {
        changes: [
          {
            kind: 'rewrite',
            itemIDs: [itemIDs.rewrite],
            text: 'Marisol says mondays are the wet sock of the week',
            reason: 'Names Marisol instead of "the owner".',
          },
          {
            kind: 'merge',
            itemIDs: itemIDs.merge,
            text: 'Her sister Wren lives in Galway, and she teaches piano, which she started last spring',
            reason: 'Both items are about Wren.',
          },
        ],
        summary: 'Two items conflict on coffee: one says oat milk, the other black with no milk.',
      },
    },
  };
}
