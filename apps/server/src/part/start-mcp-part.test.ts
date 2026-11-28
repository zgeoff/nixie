import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startStandInMcp } from '@heynixie/mcp/test-utils';
import { defaultProposalConfig, readProposal } from '@heynixie/proposals';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections } from '@heynixie/tasks';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
  seedDefinitionTask,
  seedOpenDefinitionRun,
} from '@heynixie/tasks/test-utils';
import { buildToolRegistry, collectHeldToolNames } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { startMcpPart } from './start-mcp-part';

async function setupTest() {
  const standIn = await startStandInMcp({
    tools: [{ name: 'item_get', description: 'Read one item.', inputSchema: { type: 'object' } }],
    extraProjections: tasksProjections,
  });

  await standIn.approveServer();
  await standIn.signIn(standIn.mcp);

  const definitionStore = buildTestDefinitionStore();

  const context: TasksContext = {
    log: standIn.test.log,
    clock: standIn.test.clock,
    definitions: standIn.test.context.definitions,
    runSettings: buildTestRunSettings(),
    runners: buildTestTaskRunners(),
    readDefinitionVersion: definitionStore.readDefinitionVersion,
    readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
    readDefinitionNextFire: definitionStore.readDefinitionNextFire,
  };

  const part = await startMcpPart(
    {
      context,
      credentials: { store: standIn.held.store },
      heldSlot: { read: () => ({ backend: standIn.held.backend }) },
      config: { time: { default_zone: 'UTC' } },
      cleanup: {
        defer: (stop) => {
          onTestFinished(stop);

          return Promise.resolve();
        },
      },
      log: () => {},
    },
    {
      listingTimeoutSeconds: 5,
      servers: { tracker: standIn.facts },
    },
    { find: () => null },
    { lapseDays: { ...defaultProposalConfig.lapseDays, mcp: 2 } },
  );

  return {
    ...standIn,
    part,
    startRun: async (definitionID: string, tools: readonly string[]) => {
      const definitionHash = `${definitionID}-hash`;

      const taskID = await seedDefinitionTask(
        { context, definitionStore, writer: standIn.test.log.writer },
        { definitionID, definitionHash, version: { tools } },
      );

      await seedOpenDefinitionRun(context, { taskID, definitionID, definitionHash });

      return taskID;
    },
    readNotes: async () => {
      const records = await readRecords(standIn.test.log, {
        afterSequence: 0,
        kinds: ['tool_changed'],
      });

      return records.map((entry) => entry.record.thread);
    },
  };
}

test('it leaves a change note in the conversation and in each task whose run holds the tool, when a listing that the part started moves a pin', async () => {
  const ctx = await setupTest();
  const chase = await ctx.startRun('chase-items', ['tracker.*']);

  await ctx.startRun('water-plants', ['notes_read']);
  await ctx.part.list('tracker');

  ctx.site.setTools([
    { name: 'item_get', description: 'Read one item, newly.', inputSchema: { type: 'object' } },
  ]);

  await ctx.part.list('tracker');

  const notes = await ctx.readNotes();

  expect(notes).toStrictEqual(['conversation', chase]);
});

test('it lapses an accept proposal of a tool after the days that the config sets for the family', async () => {
  const ctx = await setupTest();

  await ctx.part.list('tracker');

  ctx.site.setTools([
    {
      name: 'item_get',
      description: 'Read one item.',
      inputSchema: { type: 'object', properties: { owner: { type: 'string' } } },
    },
  ]);

  await ctx.part.list('tracker');

  const allowed = await ctx.part.allow('tracker.item_get');

  invariant(allowed.status === 'proposed');

  const row = await readProposal(ctx.test.log.writer.db, allowed.proposalID);

  expect(row?.lapsesAt).toBe(ctx.test.clock.now() + 2 * 24 * 60 * 60 * 1000);
});

test('it holds the tools of a configured server for a task run that names the whole server, once the server lists them', async () => {
  const ctx = await setupTest();

  await ctx.part.list('tracker');

  const registry = buildToolRegistry([], [ctx.part.tools]);
  const held = collectHeldToolNames(['tracker.*'], registry.toolNames, registry.serverIDs);

  expect(held).toStrictEqual({ held: ['tracker.item_get'], unknown: [] });
});
