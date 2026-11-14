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
      messaging: { directory: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: { session: { parts: {}, template: '{{ persona }}\n{{ parts.safety }}' } },
      skillCatalog: null,
      batch: [],
      brief: null,
      previousCore: null,
      isNewSession: true,
      isFirstSession: true,
      isContinuation: false,
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
            speaker: 'plain_task',
          },
        ],
        hopLimit: 20,
        ownerName: null,
        agentName: null,
      },
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: null,
      previousCore: null,
      isNewSession: false,
      isFirstSession: false,
      isContinuation: false,
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
      messaging: { directory: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: null,
      previousCore: [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 }],
      isNewSession: false,
      isFirstSession: false,
      isContinuation: false,
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
      messaging: { directory: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: null,
      previousCore: [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 }],
      isNewSession: false,
      isFirstSession: false,
      isContinuation: false,
    },
  );

  expect(readPinnedCoreUse).toHaveBeenCalledOnce();
  expect(context.preamble.join('\n')).toInclude('Pinned memory now: 1 item, 31 of 2000 tokens.');
});

test("it renders a started task's first turn with the task prompt, no start note, and no memory or board", async () => {
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
            speaker: 'plain_task',
          },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
        agentName: null,
      },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: null,
      previousCore: null,
      isNewSession: true,
      isFirstSession: true,
      isContinuation: false,
    },
  );

  expect(context).toStrictEqual({
    systemPrompt: expect.stringMatching(/^You are "Tide tables", a task working for Robin\./u),
    pinnedMemory: null,
    preamble: [],
    pinnedCore: [],
    retrieved: [],
    retrievedMessages: [],
  });
});

test('it puts the brief that a task of the release before holds in its creation record last in the preamble of its first turn', async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'none' },
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: {
        origin: 'created',
        taskID: 'k3x9m2p7qa',
        from: 'conversation',
        sequence: 4,
        sentAt: new Date('2026-10-14T12:00:00Z'),
        body: 'Find the high tides for Saturday.',
      },
      previousCore: null,
      isNewSession: true,
      isFirstSession: true,
      isContinuation: false,
    },
  );

  expect(context.preamble).toStrictEqual([
    expect.stringMatching(
      /^<task-message id="k3x9m2p7qa" from="task: conversation" kind="request" sent="[^"]+" fence="(?<fence>\w+)">\nFind the high tides for Saturday\.\n<\/task-message fence="\k<fence>">$/u,
    ),
  ]);
});

test('it leaves the brief of a task of the release before out of the preamble once the task has a session', async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'none' },
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: {
        origin: 'created',
        taskID: 'k3x9m2p7qa',
        from: 'conversation',
        sequence: 4,
        sentAt: new Date('2026-10-14T12:00:00Z'),
        body: 'Find the high tides for Saturday.',
      },
      previousCore: null,
      isNewSession: true,
      isFirstSession: false,
      isContinuation: false,
    },
  );

  expect(context.preamble).toStrictEqual([]);
});

test("it gives a started task's rebuilt session no preamble block", async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'wake' },
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: null,
      previousCore: null,
      isNewSession: true,
      isFirstSession: false,
      isContinuation: false,
    },
  );

  expect(context.preamble).toStrictEqual([]);
});

test('it tells a started task whose cut work it carries on to continue that work', async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'wake' },
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      batch: [],
      brief: null,
      previousCore: null,
      isNewSession: false,
      isFirstSession: false,
      isContinuation: true,
    },
  );

  expect(context.preamble).toStrictEqual([
    expect.stringMatching(
      /^<system-message type="task-continue" [^>]+>\nAn interrupt stopped your last turn before its work was done\. Continue the work that is not done yet\.\n<\/system-message/u,
    ),
  ]);
});
