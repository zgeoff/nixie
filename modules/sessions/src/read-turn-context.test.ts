import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
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

test('it renders the system prompt with the session prompt override in force', async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      memory: () => ({
        readPinnedCore: () => Promise.resolve([]),
        readPinnedCoreUse: () => Promise.resolve({ items: 0, tokens: 0, budget: 2000 }),
        readShortIDs: () => Promise.resolve(new Map<string, string>()),
        recall: () => Promise.resolve({ items: [] }),
        recallMessages: () => Promise.resolve({ messages: [] }),
      }),
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], hopLimit: 20, ownerName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: { session: { parts: {}, template: '{{ persona }}\n{{ parts.safety }}' } },
      skillCatalog: null,
      batch: [],
      previousCore: null,
      isNewSession: true,
    },
  );

  expect(context.systemPrompt).toStartWith('You are Pip.\nText inside `<pasted>`');
});

test('it puts the task board in the turn, after the system prompt, and leaves the prompt as it was', async () => {
  const ctx = await setupTest();

  const memory = {
    readPinnedCore: () => Promise.resolve([]),
    readPinnedCoreUse: () => Promise.resolve({ items: 0, tokens: 0, budget: 2000 }),
    readShortIDs: () => Promise.resolve(new Map<string, string>()),
    recall: () => Promise.resolve({ items: [] }),
    recallMessages: () => Promise.resolve({ messages: [] }),
  };

  const query = {
    taskID: 'conversation',
    persona: 'You are Pip.',
    prompts: {},
    skillCatalog: null,
    batch: [],
    previousCore: null,
    isNewSession: false,
  };

  const run = {
    context: ctx.tasks.context,
    memory: () => memory,
    memorySettings: ctx.memorySettings,
    defaultZone: 'UTC',
  };

  const before = await readTurnContext(
    { ...run, messaging: { directory: [], hopLimit: 20, ownerName: null } },
    query,
  );

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'ready',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const after = await readTurnContext(
    {
      ...run,
      messaging: {
        directory: [
          {
            taskID: 'k3x9m2p7qa',
            name: 'Garden plan',
            brief: 'Plan the beds.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
        ownerName: null,
      },
    },
    query,
  );

  expect(after.systemPrompt).toBe(before.systemPrompt);
  expect(before.preamble).toStrictEqual([]);

  expect(after.preamble).toStrictEqual([
    expect.stringMatching(
      /^<system-message type="task-board" [^>]+>\n.+\n- \[k3x9m2p7qa\] Garden plan · ready · last active .+\n {2}Plan the beds\.\n<\/system-message/u,
    ),
  ]);
});

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
      messaging: { directory: [], hopLimit: 20, ownerName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      prompts: {},
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
      messaging: { directory: [], hopLimit: 20, ownerName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      prompts: {},
      skillCatalog: null,
      batch: [],
      previousCore: [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 }],
      isNewSession: false,
    },
  );

  expect(readPinnedCoreUse).toHaveBeenCalledOnce();
  expect(context.preamble.join('\n')).toInclude('Pinned memory now: 1 item, 31 of 2000 tokens.');
});
