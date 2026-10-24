import { expect, onTestFinished, test } from 'bun:test';
import { buildActionQueue } from '@heynixie/actions';
import { modelsConfigSchema } from '@heynixie/models';
import { startTestSessionHost } from '@heynixie/sessions/test-utils';
import { runTaskSteps } from '@heynixie/tasks/test-utils';
import { buildTestClock, startScriptedModel } from '@heynixie/testing';
import { buildMemoryTools } from './build-memory-tools';
import { consolidationConfigSchema } from './consolidation-config-schema';
import { memoryProjections } from './memory-projections';
import { startMemoryConsolidatorRunner } from './start-memory-consolidator-runner';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemoryStore } from './test-utils/start-test-memory-store';

async function setupTest() {
  const host = await startTestSessionHost({ projections: memoryProjections });

  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));
  const context = { ...host.context, clock };
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
    sandboxes: host.sandboxes,
    queue: buildActionQueue(context).queue,
    socketDir: host.socketDir,
    image: 'nixie-conversation-0123456789ab',
    store,
    config: consolidationConfigSchema.parse({}),
    getPersona: () => '',
    getPrompts: () => ({}),
    ownerName: 'Marisol',
    onError: (error) => {
      throw error;
    },
  });

  host.defer(() => consolidator.stop());

  return {
    model,
    store,
    run: () =>
      runTaskSteps(context, {
        steps: { 'memory-consolidator': consolidator.runStep },
        advance: (durationMs) => {
          clock.advance(durationMs);
        },
        probeDone: async () => (await store.consolidations.readPending()) !== null,
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

test("it shows the session the owner's name and each item's quote under its text", async () => {
  const ctx = await setupTest();

  await Promise.all([
    createMemoryItem(ctx.store, {
      text: 'The owner calls Mondays the wet sock of the week',
      quote: 'honestly mondays are the wet sock of the week',
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
    String.raw`: The owner calls Mondays the wet sock of the week\n  quote: honestly mondays are the wet sock of the week\n- `,
  );
}, 60_000);

test('it carries an idiom word for word, a pronoun through a merge, and a summary of 2 conflicting items it left alone', async () => {
  const ctx = await setupTest();

  const [mondays, sister, galway, oat, black] = await Promise.all([
    createMemoryItem(ctx.store, { text: 'The owner calls Mondays the wet sock of the week' }),
    createMemoryItem(ctx.store, { text: 'Her sister Wren lives in Galway' }),
    createMemoryItem(ctx.store, {
      text: 'Wren moved to Galway this spring, she loves it there',
    }),
    createMemoryItem(ctx.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.store, { text: 'Takes coffee black with no milk' }),
  ]);

  ctx.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_consolidate',
        input: {
          changes: [
            {
              kind: 'rewrite',
              itemIDs: [mondays.itemID],
              text: 'Marisol calls Mondays the wet sock of the week',
              reason: 'Names Marisol instead of "the owner".',
            },
            {
              kind: 'merge',
              itemIDs: [sister.itemID, galway.itemID],
              text: 'Her sister Wren moved to Galway this spring, she loves it there',
              reason: 'Both items say Wren lives in Galway.',
            },
          ],
          summary:
            'Two items conflict and stay unchanged: one says Marisol takes oat milk in her coffee, and the other says she only drinks it black.',
        },
      },
    },
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
      text: 'Marisol calls Mondays the wet sock of the week',
    },
    {
      kind: 'merge',
      inputs: [
        { ...sister, isCurrent: true },
        { ...galway, isCurrent: true },
      ],
      text: 'Her sister Wren moved to Galway this spring, she loves it there',
    },
  ]);

  expect(
    diff?.changes.flatMap((change) => change.inputs.map((input) => input.itemID)),
  ).not.toIncludeAnyMembers([oat.itemID, black.itemID]);

  expect(diff?.summary?.text).toBe(
    'Two items conflict and stay unchanged: one says Marisol takes oat milk in her coffee, and the other says she only drinks it black.',
  );
}, 60_000);

test('it leaves the summary of a run that proposed no change for your review and for memory.diff', async () => {
  const ctx = await setupTest();

  const summary = 'Two items about coffee conflict, so I left both: oat milk, or black?';

  await Promise.all([
    createMemoryItem(ctx.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.store, { text: 'Takes coffee black with no milk' }),
  ]);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__memory_consolidate', input: { changes: [], summary } } },
    { text: 'done' },
  );

  await ctx.run();

  const pending = await ctx.store.consolidations.readPending();

  const conversation = await buildMemoryTools(ctx.store, {
    clock: { now: () => Date.now() },
    ownerName: 'Marisol',
    agentName: null,
    defaultZone: 'UTC',
  })
    .find((definition) => definition.name === 'memory.diff')
    ?.run(
      { callID: 'call-1', tool: 'memory.diff', input: {}, toolUseID: null },
      {
        run: {
          runID: 'run-1',
          thread: 'conversation',
          tools: ['memory.diff'],
          model: { model: 'claude-test-1', profile: 'tidy-direct' },
        },
      },
    );

  expect(pending).toMatchObject({ changes: [], summary: { text: summary } });
  expect(conversation).toMatchObject({ status: 'ok', result: { changes: [], summary } });
}, 60_000);
