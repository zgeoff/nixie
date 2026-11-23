import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildTestTaskRun } from '@heynixie/tasks/test-utils';
import { renderRunBlocks } from '../task/render-run-blocks';
import { buildMockDefinitionBrief } from '../test-utils/build-mock-definition-brief';
import { buildStubMemory } from '../test-utils/build-stub-memory';
import { seedSessionInvalidated } from '../test-utils/seed-session-invalidated';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readTurnContext } from './read-turn-context';

async function setupTest() {
  const tasks = await startTestTasks();

  const memorySettings = {
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
        readIndex: () => Promise.resolve({ text: '', items: 0, tokens: 0, budget: 0 }),
        readShortIDs: () => Promise.resolve(new Map<string, string>()),
        readTurnMemory: () => Promise.resolve({ kind: 'none' as const }),
      }),
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: { session: { parts: {}, template: '{{ persona }}\n{{ parts.safety }}' } },
      skillCatalog: null,
      runBlocks: null,
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
        readIndex: () => Promise.resolve({ text: '', items: 0, tokens: 0, budget: 0 }),
        readShortIDs: () => Promise.resolve(new Map<string, string>()),
        readTurnMemory: () => Promise.resolve({ kind: 'none' as const }),
      }),
      memorySettings: ctx.memorySettings,
      defaultZone: 'UTC',
      messaging: {
        directory: [
          {
            taskID: 'k3x9m2p7qa',
            name: 'Garden plan',
            brief: 'Plan the beds.',
            wakeable: true,
            speaker: 'plain_task',
          },
        ],
        unlisted: [],
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
      runBlocks: null,
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
          revision: 1,
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
    readIndex: () => Promise.resolve({ text: '', items: 0, tokens: 0, budget: 0 }),
    readShortIDs,
    readTurnMemory: () => Promise.resolve({ kind: 'none' as const }),
  };

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'conversation' } as const,
      memory: () => memory,
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
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
          revision: 2,
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
    readIndex: () => Promise.resolve({ text: '', items: 0, tokens: 0, budget: 0 }),
    readShortIDs: () => Promise.resolve(new Map<string, string>()),
    readTurnMemory: () => Promise.resolve({ kind: 'none' as const }),
  };

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'conversation' } as const,
      memory: () => memory,
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are a helpful assistant.',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
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
            wakeable: true,
            speaker: 'plain_task',
          },
        ],
        unlisted: [],
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
      runBlocks: null,
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
  });
});

test('it puts the brief that a task of the release before holds in its creation record last in the preamble of its first turn', async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'none' },
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
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
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
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
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
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
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
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

test('it asks the memory once with the message text, and places nothing when it answers none', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Where did I leave the bike pump?' },
    },
  ]);

  const written = await readRecords(ctx.tasks.context.log, { afterSequence: 0 });

  const batch = written.map((entry) => entry.record);
  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'conversation' } as const,
      memory: () => memory,
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
      batch,
      brief: null,
      previousCore: null,
      isNewSession: true,
      isFirstSession: false,
      isContinuation: false,
    },
  );

  expect(memory.readTurnMemory.mock.calls.map(([ask]) => [ask.text, ask.thread])).toStrictEqual([
    ['Where did I leave the bike pump?', 'conversation'],
  ]);

  expect(context.retrieved).toStrictEqual([]);
  expect(context.preamble.join('\n')).not.toInclude('retrieved-');
});

test('it hands the memory held lists that read nothing until called, and none for a new session', async () => {
  const ctx = await setupTest();

  const memory = buildStubMemory({ pinned: [], pinnedUse: { items: 0, tokens: 0, budget: 2000 } });

  await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'conversation' } as const,
      memory: () => memory,
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
      batch: [],
      brief: null,
      previousCore: null,
      isNewSession: true,
      isFirstSession: false,
      isContinuation: false,
    },
  );

  const held = memory.readTurnMemory.mock.calls[0]?.[0].held;

  const versions = await held?.readVersions();

  expect(versions).toStrictEqual([]);
});

test('it hands the memory the start of the session that its writes belong to, and none for a new session', async () => {
  const ctx = await setupTest();

  const [ended] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {},
    },
  ]);

  await seedSessionInvalidated(ctx.tasks.context);

  const askWriteStart = async (isNewSession: boolean) => {
    const memory = buildStubMemory({
      pinned: [],
      pinnedUse: { items: 0, tokens: 0, budget: 2000 },
    });

    await readTurnContext(
      {
        context: ctx.tasks.context,
        frame: { kind: 'conversation' } as const,
        memory: () => memory,
        memorySettings: ctx.memorySettings,
        messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
        defaultZone: 'UTC',
      },
      {
        taskID: 'conversation',
        persona: 'You are Pip.',
        prompts: {},
        skillCatalog: null,
        runBlocks: null,
        batch: [],
        brief: null,
        previousCore: null,
        isNewSession,
        isFirstSession: false,
        isContinuation: false,
      },
    );

    return memory.readTurnMemory.mock.calls[0]?.[0].held.readWriteStart();
  };

  expect({
    resumed: await askWriteStart(false),
    fresh: await askWriteStart(true),
  }).toStrictEqual({ resumed: ended?.sequence, fresh: null });
});

test('it asks nothing of a run with no memory', async () => {
  const ctx = await setupTest();

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'conversation' } as const,
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
      batch: [],
      brief: null,
      previousCore: null,
      isNewSession: true,
      isFirstSession: false,
      isContinuation: false,
    },
  );

  expect(context.retrieved).toStrictEqual([]);
});

test('it places the items that the memory answers with, whatever the index showed', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Where did I leave the bike pump?' },
    },
  ]);

  const written = await readRecords(ctx.tasks.context.log, { afterSequence: 0 });

  const batch = written.map((entry) => entry.record);

  const memory = buildStubMemory({
    pinned: [],
    pinnedUse: { items: 0, tokens: 0, budget: 2000 },
    index: {
      text: 'About the owner:\n  home (1)  [b7kq2m9xza] spare bike pump behind the shed door',
      items: 1,
      tokens: 20,
      budget: 3000,
    },
  });

  memory.readTurnMemory.mockResolvedValue({
    kind: 'placed',
    selfNotes: [],
    items: [
      {
        itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01',
        shortID: 'b7kq2m9xza',
        version: 1,
        revision: 1,
        subject: 'owner',
        text: 'The spare bike pump is behind the shed door',
        origin: 'owner',
        source: 'owner',
        model: null,
        recordedAt: 1_000_000,
        evidenceQuote: null,
        approval: null,
      },
    ],
  });

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'conversation' } as const,
      memory: () => memory,
      memorySettings: ctx.memorySettings,
      messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
      defaultZone: 'UTC',
    },
    {
      taskID: 'conversation',
      persona: 'You are Pip.',
      prompts: {},
      skillCatalog: null,
      runBlocks: null,
      batch,
      brief: null,
      previousCore: null,
      isNewSession: true,
      isFirstSession: false,
      isContinuation: false,
    },
  );

  expect(context.preamble.join('\n')).toInclude('The spare bike pump is behind the shed door');

  expect(context.retrieved).toStrictEqual([
    { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 },
  ]);

  expect(memory.readIndex).not.toHaveBeenCalled();
});

test("it renders the first turn of a fire-opened definition's task run with its run blocks in order, then its brief last, and names the report target in the prompt", async () => {
  const ctx = await setupTest();

  const base = buildTestTaskRun({ runID: 'k3f9c2d4-0000-0000-0000-000000000000' });

  const run = {
    ...base,
    opened: {
      ...base.opened,
      reportShape: {
        type: 'object',
        additionalProperties: false,
        properties: { city: { type: 'string' } },
      } as const,
    },
  };

  const runBlocks = renderRunBlocks(
    run,
    { stepKey: 'tide-tables:1', isNewSession: true },
    {
      zone: 'UTC',
      details: {
        kind: 'schedule',
        scheduledFor: '2026-06-04T06:30:00Z',
        startedAt: '2026-06-04T06:30:01Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
        sentence: 'This task run was scheduled for Thu 4 Jun, 06:30 and started at 06:30.',
      },
    },
    {
      previousStartedAt: new Date('2026-06-03T06:30:01Z'),
      startedAt: new Date('2026-06-04T06:30:01Z'),
    },
  );

  const context = await readTurnContext(
    {
      context: ctx.tasks.context,
      frame: { kind: 'task', startedBy: 'conversation', report: 'wake' },
      memorySettings: ctx.memorySettings,
      messaging: {
        directory: [
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks with the owner.',
            wakeable: true,
            speaker: 'conversation',
          },
          {
            taskID: 'k3x9m2p7qa',
            name: 'Tide tables',
            brief: 'Find the high tides.',
            wakeable: true,
            speaker: 'plain_task',
          },
        ],
        unlisted: [],
        hopLimit: 20,
        ownerName: 'Robin',
        agentName: 'Aria',
      },
      defaultZone: 'UTC',
    },
    {
      taskID: 'k3x9m2p7qa',
      persona: '',
      prompts: {},
      skillCatalog: null,
      report: { mode: 'wake', target: 'conversation' },
      runBlocks,
      batch: [],
      brief: buildMockDefinitionBrief(),
      briefPlace: 'preamble',
      previousCore: null,
      isNewSession: true,
      isFirstSession: true,
      isContinuation: false,
    },
  );

  const tags = context.preamble
    .join('\n')
    .matchAll(/^<(?<tag>input name="[a-z-]+"|report-shape|task-message)/gmu);

  expect([...tags].map((match) => match.groups?.['tag'])).toStrictEqual([
    'input name="trigger"',
    'report-shape',
    'input name="since"',
    'task-message',
  ]);

  expect(context.preamble.at(-1)).toStartWith(
    '<task-message id="d4h9" from="task definition: Tide tables" kind="request"',
  );

  expect(context.systemPrompt).toInclude(
    'with a short summary. Your report goes to Aria, in the chat with Robin. Calling it ends the task.',
  );
});

test.each(['pinned', 'none'] as const)(
  "it leaves a definition's brief out of the preamble when its place is %s",
  async (briefPlace) => {
    const ctx = await setupTest();

    const context = await readTurnContext(
      {
        context: ctx.tasks.context,
        frame: { kind: 'task', startedBy: 'conversation', report: 'none' },
        memorySettings: ctx.memorySettings,
        messaging: { directory: [], unlisted: [], hopLimit: 20, ownerName: null, agentName: null },
        defaultZone: 'UTC',
      },
      {
        taskID: 'k3x9m2p7qa',
        persona: '',
        prompts: {},
        skillCatalog: null,
        runBlocks: null,
        batch: [],
        brief: buildMockDefinitionBrief(),
        briefPlace,
        previousCore: null,
        isNewSession: true,
        isFirstSession: false,
        isContinuation: false,
      },
    );

    expect(context.preamble).toStrictEqual([]);
  },
);
