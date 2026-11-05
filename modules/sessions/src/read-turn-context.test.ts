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
      frame: { kind: 'conversation' } as const,
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
      isFirstSession: true,
    },
  );

  expect(context.systemPrompt).toStartWith('You are Pip.\nText inside `<pasted>`');
});

test("it puts no task board in the conversation's turn, with a started task in the log", async () => {
  const ctx = await setupTest();

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

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'conversation' } as const,
      memory: () => ({
        readPinnedCore: () => Promise.resolve([]),
        readPinnedCoreUse: () => Promise.resolve({ items: 0, tokens: 0, budget: 2000 }),
        readShortIDs: () => Promise.resolve(new Map<string, string>()),
        recall: () => Promise.resolve({ items: [] }),
        recallMessages: () => Promise.resolve({ messages: [] }),
      }),
      memorySettings: ctx.memorySettings,
      defaultZone: 'UTC',
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
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: {},
      skillCatalog: null,
      batch: [],
      previousCore: null,
      isNewSession: false,
      isFirstSession: false,
    },
  );

  expect(context.preamble).toStrictEqual([]);
  expect(context.systemPrompt).not.toContain('Plan the beds.');
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
      frame: { kind: 'conversation' } as const,
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
      isFirstSession: false,
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
      frame: { kind: 'conversation' } as const,
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
      isFirstSession: false,
    },
  );

  expect(readPinnedCoreUse).toHaveBeenCalledOnce();
  expect(context.preamble.join('\n')).toInclude('Pinned memory now: 1 item, 31 of 2000 tokens.');
});

test("it renders a started task's first turn with the task prompt, a start note, and no memory or board", async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'wake' },
      memorySettings: { ...ctx.memorySettings, ownerName: 'Robin' },
      messaging: {
        directory: [
          {
            taskID: 'k3x9m2p7qa',
            name: 'Tide tables',
            brief: 'Find the high tides for Saturday.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
      },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      previousCore: null,
      isNewSession: true,
      isFirstSession: true,
    },
  );

  expect(context).toStrictEqual({
    systemPrompt: expect.stringMatching(
      /^You are "Tide tables", one of the tasks that nixie runs for Robin\./u,
    ),
    pinnedMemory: null,
    preamble: [
      expect.stringMatching(
        /^<system-message type="task-start" [^>]+>\nYour task starts now: do what the brief in your instructions asks\. When you have the result, send it with task\.message to conversation, the task that started you, with the kind report\.\n<\/system-message/u,
      ),
    ],
    pinnedCore: [],
    retrieved: [],
    retrievedMessages: [],
  });
});

test('it tells a task started with no report to send its starter none', async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'none' },
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], hopLimit: 20, ownerName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      previousCore: null,
      isNewSession: true,
      isFirstSession: true,
    },
  );

  expect(context.preamble).toStrictEqual([
    expect.stringMatching(
      /^<system-message type="task-start" [^>]+>\nYour task starts now: do what the brief in your instructions asks\. The task that started you, conversation, asked for no report, so send it none\.\n<\/system-message/u,
    ),
  ]);
});

test("it gives a started task's rebuilt session no start note", async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'wake' },
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], hopLimit: 20, ownerName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      previousCore: null,
      isNewSession: true,
      isFirstSession: false,
    },
  );

  expect(context.preamble).toStrictEqual([]);
});
