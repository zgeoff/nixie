import { expect, mock, test } from 'bun:test';
import { readTurnContext } from './read-turn-context';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  const memorySettings = {
    retrievalItems: 5,
    retrievalSelfNotes: 2,
    retrievalMessages: 3,
    retrievalMinScore: 0,
    retrievalMinSimilarity: 0,
    rebuildTokens: 1000,
    ownerName: null,
    agentNames: [],
  };

  return { tasks, memorySettings };
}

test('it reads the pinned figures for no turn whose pinned core is unchanged', async () => {
  const ctx = await setupTest();

  const readPinnedCoreUse = mock(() => Promise.resolve({ items: 1, tokens: 31, budget: 2000 }));
  const readShortIDs = mock(() => Promise.resolve(new Map<string, string>()));

  const memory = {
    readPinnedCore: () =>
      Promise.resolve([
        {
          itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
          shortID: 'b7kq2m9xza',
          version: 1,
          subject: 'owner' as const,
          text: 'Uses they/them',
          origin: 'conversation' as const,
          source: 'owner' as const,
          model: null,
          recordedAt: 1_000_000,
          evidenceQuote: null,
          approval: null,
        },
      ]),
    readPinnedCoreUse,
    readShortIDs,
    recall: () => Promise.resolve({ items: [] }),
    recallMessages: () => Promise.resolve({ messages: [] }),
  };

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      memory: () => memory,
      memorySettings: ctx.memorySettings,
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      skillCatalog: null,
      batch: [],
      previousCore: [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 }],
      isNewSession: false,
    },
  );

  expect(readPinnedCoreUse).not.toHaveBeenCalled();
  expect(readShortIDs).not.toHaveBeenCalled();
  expect(context.preamble.join('\n')).not.toInclude('pinned-memory-changes');
});

test('it reads the pinned figures once for a turn whose pinned core changed, and puts them in the change note', async () => {
  const ctx = await setupTest();

  const readPinnedCoreUse = mock(() => Promise.resolve({ items: 1, tokens: 31, budget: 2000 }));

  const memory = {
    readPinnedCore: () =>
      Promise.resolve([
        {
          itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
          shortID: 'b7kq2m9xza',
          version: 2,
          subject: 'owner' as const,
          text: 'Uses they/them',
          origin: 'conversation' as const,
          source: 'owner' as const,
          model: null,
          recordedAt: 1_000_000,
          evidenceQuote: null,
          approval: null,
        },
      ]),
    readPinnedCoreUse,
    readShortIDs: () => Promise.resolve(new Map<string, string>()),
    recall: () => Promise.resolve({ items: [] }),
    recallMessages: () => Promise.resolve({ messages: [] }),
  };

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      memory: () => memory,
      memorySettings: ctx.memorySettings,
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      skillCatalog: null,
      batch: [],
      previousCore: [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 }],
      isNewSession: false,
    },
  );

  expect(readPinnedCoreUse).toHaveBeenCalledOnce();
  expect(context.preamble.join('\n')).toInclude('Pinned memory now: 1 item, 31 of 2000 tokens.');
});
