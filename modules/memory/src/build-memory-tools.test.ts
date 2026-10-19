import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildMemoryTools } from './build-memory-tools';
import { defaultGateLimits } from './default-gate-limits';
import type { TestMemoryOptions } from './test-utils';
import {
  buildMockCheckerAnswer,
  buildMockWriteCaller,
  createProposal,
  makeToolAllowRule,
  readItemShortID,
  startTestMemory,
  writeModelReplyRecord,
} from './test-utils';
import { buildMockToolContext } from './test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import type { MemoryTables } from './types';

// a test memory with the gate the config gives, the memory tools' registry, and the options a tool
// call runs under, which record each call and its result in the memory's log
async function setupTest(config: TestMemoryOptions = {}) {
  const memory = await startTestMemory(config);

  // each recalled item's line needs a name and a zone, and these keep its words the defaults
  const registry = buildToolRegistry(
    buildMemoryTools(memory.store, {
      clock: { now: () => Date.now() },
      ownerName: null,
      agentName: null,
      defaultZone: 'UTC',
    }),
  );

  return {
    memory,
    registry,
    toolCallOptions: {
      registry,

      // every call is allowed, so each reaches its tool
      decide: () => ({
        decision: { outcome: 'allow' as const, stage: 3, rule: null },
        sentence: null,
      }),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      // the memory tools run direct, so nothing reaches the queue
      queue: {
        enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  };
}

test('it declares read for recall, pending and diff, export for export, and note for remember, edit, retire, the image offer, comment and rate', async () => {
  const ctx = await setupTest();

  const effects = [
    'memory.recall',
    'memory.pending',
    'memory.remember',
    'memory.edit',
    'memory.retire',
    'memory.offer_image',
    'memory.answer_offer',
    'memory.diff',
    'memory.comment',
    'memory.rate',
    'memory.export',
  ].map((name) => [name, ctx.registry.findTool(name)?.definition.declaration.effects]);

  expect(effects).toStrictEqual([
    ['memory.recall', ['read']],
    ['memory.pending', ['read']],
    ['memory.remember', ['note']],
    ['memory.edit', ['note']],
    ['memory.retire', ['note']],
    ['memory.offer_image', ['note']],
    ['memory.answer_offer', ['note']],
    ['memory.diff', ['read']],
    ['memory.comment', ['note']],
    ['memory.rate', ['note']],
    ['memory.export', ['export']],
  ]);
});

test('it applies a backed fact with the caller and model of the run, never of the arguments', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'task-9',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'Allergic to hazelnuts', quote: "I'm allergic to hazelnuts" },
      toolUseID: null,
    },
    buildMockToolContext({
      thread: 'task-9',
      model: { model: 'test-model', profile: 'standard' },
    }),
  );

  invariant(outcome.status === 'ok' && typeof outcome.result['itemID'] === 'string');

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .innerJoin('memory_items', 'memory_items.item_id', 'memory_versions.item_id')
    .select(['origin', 'source', 'task_id', 'model'])
    .where('memory_items.short_id', '=', outcome.result['itemID'])
    .executeTakeFirstOrThrow();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: expect.toBeString(), version: 1 },
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });

  expect(row).toStrictEqual({
    origin: 'task',
    source: 'owner',
    task_id: 'task-9',
    model: 'test-model',
  });
});

test('it applies a fact quoted from a message outside the window by its event ID', async () => {
  const ctx = await setupTest({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })),
      limits: { evidenceWindow: 1, proposalLapseMs: 1000, proposalCap: 10, closeMatchScore: 0.6 },
    },
  });

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My bike is the green one',
    spans: [{ start: 0, end: 24, source: 'typed' }],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Thanks',
    spans: [{ start: 0, end: 6, source: 'typed' }],
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: {
        text: 'Bike is the green one',
        quote: 'My bike is the green one',
        eventID: String(sequence),
      },
      toolUseID: null,
    },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: expect.toBeString(), version: 1 },
  });
});

test('it returns a proposal with the sentence for its reason, not an error, for a fact with no quote', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.remember');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.remember',
      input: { text: 'Allergic to hazelnuts' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "no_quote: Saved as a proposal for the owner to review. The write gave no quote, or neither the owner's last 20 messages nor the message its eventID names contains it.",
    merged: false,
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
});

test.each(['shared', 'self'] as const)(
  'it proposes a memory with the %s subject the call names',
  async (subject) => {
    const ctx = await setupTest();

    const tool = ctx.registry.findTool('memory.remember');

    invariant(tool);

    await tool.definition.run(
      {
        callID: 'call-1',
        tool: 'memory.remember',
        input: { text: 'Calls the garden shed the cabin', subject },
        toolUseID: null,
      },
      {
        run: {
          runID: 'run-1',
          thread: 'conversation',
          tools: [],
          model: { model: 'test-model', profile: 'standard' },
        },
      },
    );

    const pending = await ctx.memory.store.proposals.listPending();

    expect(pending.map((proposal) => [proposal.subject, proposal.text])).toStrictEqual([
      [subject, 'Calls the garden shed the cabin'],
    ]);
  },
);

test('it gives the token sentence for a fact with a number its typed quote lacks', async () => {
  const ctx = await setupTest({ gate: { ownerName: 'Avery' } });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My phone number changed',
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: { text: 'Phone number is 0412 555 019', quote: 'My phone number changed' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "token_missing: Saved as a proposal for Avery to review. The new text has a number, address, handle or link that isn't in the quote, or in what Avery typed in their last 20 messages when an allow rule skips the quote.",
    merged: false,
  });
});

test('it gives the token sentence under an allow rule when the owner never typed the number, even though the quote holds it', async () => {
  const ctx = await setupTest({
    gate: { findAllowRule: makeToolAllowRule('memory.remember'), ownerName: 'Avery' },
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My phone number changed',
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: { text: 'Phone number is 0412 555 019', quote: 'Phone number is 0412 555 019' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "token_missing: Saved as a proposal for Avery to review. The new text has a number, address, handle or link that isn't in the quote, or in what Avery typed in their last 20 messages when an allow rule skips the quote.",
    merged: false,
  });
});

test("it names the gate's configured window in the sentence for a quote older than that window", async () => {
  const ctx = await setupTest({
    gate: {
      check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })),
      limits: { ...defaultGateLimits, evidenceWindow: 2 },
      ownerName: 'Avery',
    },
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I keep bees on the roof',
    spans: [{ start: 0, end: 23, source: 'typed' }],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The kettle is broken',
    spans: [{ start: 0, end: 20, source: 'typed' }],
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Back by six',
    spans: [{ start: 0, end: 11, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: { text: 'Keeps bees on the roof', quote: 'I keep bees on the roof' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "no_quote: Saved as a proposal for Avery to review. The write gave no quote, or neither Avery's last 2 messages nor the message its eventID names contains it.",
    merged: false,
  });
});

test('it applies a backed edit of the item its short ID names as a new version and keeps the old version in history', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  invariant(shortID);

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I live on Oak Avenue now',
    spans: [{ start: 0, end: 24, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.edit',
      input: {
        itemID: shortID,
        version: 1,
        text: 'Lives on Oak Avenue',
        quote: 'I live on Oak Avenue now',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.edit'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: shortID,
    version: 2,
  });

  expect(history?.versions).toMatchObject([
    { version: 1, change: 'created', text: 'Lives on Elm Street' },
    { version: 2, change: 'edited', origin: 'conversation', text: 'Lives on Oak Avenue' },
  ]);
});

test('it turns an edit with no backing words into a proposal with the sentence for its reason', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks oat milk',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await runToolCall(
    {
      tool: 'memory.edit',
      input: { itemID: item.itemID, version: 1, text: 'Drinks almond milk' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.edit'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const pending = await ctx.memory.store.proposals.listPending();
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(result.structuredContent).toStrictEqual({
    status: 'proposed',
    proposalID: expect.toBeString(),
    reason:
      "no_quote: Saved as a proposal for the owner to review. The write gave no quote, or neither the owner's last 20 messages nor the message its eventID names contains it.",
    merged: false,
  });

  expect(pending).toMatchObject([
    {
      operation: 'remember',
      itemID: item.itemID,
      targetVersion: 1,
      text: 'Drinks almond milk',
      reason: 'no_quote',
    },
  ]);

  expect(history?.versions).toMatchObject([{ version: 1, text: 'Drinks oat milk' }]);
});

test('it records an edit call with neither its text nor its quote, which the gate has not checked', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Owns a tabby cat called Miso',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await runToolCall(
    {
      tool: 'memory.edit',
      input: {
        itemID: item.itemID,
        version: 1,
        text: 'Owns two tabby cats called Miso and Udon',
        quote: 'Owns two tabby cats called Miso and Udon',
      },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.edit'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(entries.find((entry) => entry.record.kind === 'tool_called')?.record).toMatchObject({
    erasable: {
      status: 'readable',
      fields: { input: { itemID: item.itemID, version: 1 } },
    },
  });

  expect(JSON.stringify(entries)).not.toInclude('Udon');
});

test('it returns a stale edit to the model as an error that names the item by its short ID', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.edit');

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  invariant(tool);

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: { itemID: item.itemID, version: 1, text: 'Lives on Oak Avenue' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `memory item ${shortID} is at version 2, not the version 1 the caller read`,
  });
});

test('it returns an edit of an ID that names no item to the model as an error with that ID', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.edit');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.edit',
      input: { itemID: 'z9z9z9z9z9', version: 1, text: 'Lives on Oak Avenue' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'no memory item z9z9z9z9z9 to change',
  });
});

test('it retires the item its short ID names when the model read it and you asked to retire it', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const tool = ctx.registry.findTool('memory.retire');

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const [shortID] = await Promise.all([
    readItemShortID(ctx.memory.log, item.itemID),
    writeOwnerMessageRecord(ctx.memory.log, {
      thread: 'conversation',
      text: 'I moved out of Elm Street',
      spans: [{ start: 0, end: 25, source: 'typed' }],
    }),
  ]);

  invariant(tool);

  await ctx.memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.retire',
      input: { itemID: shortID, version: 1, intentQuote: 'I moved out of Elm Street' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', itemID: shortID, version: 2 },
  });

  expect(history?.versions.at(-1)).toMatchObject({ change: 'retired', origin: 'conversation' });
});

test('it returns a full proposal cap to the model as an error', async () => {
  const memory = await startTestMemory({
    gate: {
      limits: { evidenceWindow: 20, proposalLapseMs: 1000, proposalCap: 1, closeMatchScore: 0.6 },
    },
  });

  const tool = buildToolRegistry(
    buildMemoryTools(memory.store, {
      clock: { now: () => Date.now() },
      ownerName: null,
      agentName: null,
      defaultZone: 'UTC',
    }),
  ).findTool('memory.remember');

  const call = {
    callID: 'call-1',
    tool: 'memory.remember',
    input: { text: 'Likes jazz' },
    toolUseID: null,
  };

  const context = {
    run: {
      runID: 'run-1',
      thread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
  };

  invariant(tool);

  await tool.definition.run(call, context);

  const outcome = await tool.definition.run(
    { ...call, callID: 'call-2', input: { text: 'Likes opera' } },
    context,
  );

  expect(outcome).toMatchObject({ status: 'error', message: expect.toInclude('memory proposals') });
});

test('it recalls items with a result that its output schema accepts', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.recall');

  invariant(tool);

  await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'memory.recall',
      input: { query: 'hazelnuts', includeHistory: true },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  invariant(outcome.status === 'ok');

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });

  expect(outcome.result).toMatchObject({
    items: [{ text: 'Allergic to hazelnuts', history: [{ version: 1 }] }],
    next: null,
  });
});

test('it tells the model when to reach for recall', async () => {
  const ctx = await setupTest();

  const tool = ctx.registry.findTool('memory.recall');

  expect(tool?.definition.description).toInclude(
    'Use it when you half-remember something said, or when a detail from before would change your answer.',
  );
});

test('it recalls a version with its quote, its model and the line that says where it came from', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 1, 9, 30)));
  onTestFinished(() => setSystemTime());

  const item = await ctx.memory.store.remember({
    text: 'Keeps a sourdough starter called Gerald',
    evidenceQuote: 'Gerald the starter needs feeding again',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
      model: 'test-model-1',
    },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    items: [
      {
        itemID: shortID,
        isPinned: false,
        subject: 'owner',
        version: 1,
        change: 'created',
        state: 'active',
        text: 'Keeps a sourdough starter called Gerald',
        about: `${shortID} v1 · 1 Oct · you noted it · the owner said this`,
        quote: 'Gerald the starter needs feeding again',
        model: 'test-model-1',
      },
    ],
    next: null,
  });
});

test('it recalls a version with no quote or model without them', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 8, 14, 18, 5)));

  onTestFinished(() => {
    setSystemTime();
  });

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    items: [
      {
        itemID: shortID,
        isPinned: false,
        subject: 'owner',
        version: 1,
        change: 'created',
        state: 'active',
        text: 'Plays the cello on Sundays',
        about: `${shortID} v1 · 14 Sep · the owner said this`,
        model: null,
      },
    ],
    next: null,
  });
});

test('it recalls an approved proposal as approved by the owner, with its stored source still outside content', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 9, 13, 9, 30)));
  onTestFinished(() => setSystemTime());

  const pending = await createProposal(ctx.memory.store, { text: 'Keeps a fern on the desk' });

  await ctx.memory.store.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const shortID = await readItemShortID(ctx.memory.log, pending.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_versions')
    .select('source')
    .where('item_id', '=', pending.itemID)
    .executeTakeFirst();

  expect(result.structuredContent).toMatchObject({
    items: [
      {
        text: 'Keeps a fern on the desk',
        about: `${shortID} v1 · 13 Oct · you noted it · unconfirmed · the owner approved`,
      },
    ],
  });

  expect(row?.source).toBe('untrusted');
});

test('it recalls each past version with the version that replaced it', async () => {
  const ctx = await setupTest();

  setSystemTime(new Date(Date.UTC(2026, 2, 2, 9, 30)));
  onTestFinished(() => setSystemTime());

  const item = await ctx.memory.store.remember({
    text: 'Lives on Juniper Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Larch Road',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { includeHistory: true }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    items: [
      {
        text: 'Lives on Larch Road',
        about: `${shortID} v2 · 2 Mar · the owner said this`,
        history: [
          {
            text: 'Lives on Juniper Lane',
            about: `${shortID} v1 · 2 Mar · the owner said this · replaced by ${shortID} v2`,
          },
          {
            text: 'Lives on Larch Road',
            about: `${shortID} v2 · 2 Mar · the owner said this`,
          },
        ],
      },
    ],
  });
});

test('it recalls the item its short ID names', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps the bike lock code in the blue notebook',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Waters the ferns on Fridays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  invariant(shortID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { itemIDs: [shortID] }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    items: [{ itemID: shortID, text: 'Keeps the bike lock code in the blue notebook' }],
    next: null,
  });
});

test('it recalls an item by the item ID the model read before short IDs, under its short ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps the bike lock code in the blue notebook',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { itemIDs: [item.itemID] }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    items: [{ itemID: shortID, text: 'Keeps the bike lock code in the blue notebook' }],
  });
});

test('it gives the model a recalled item and leaves no readable copy once the item is forgotten', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Sister Ada lives in Leeds',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  const result = await runToolCall(
    { tool: 'memory.recall', input: { query: 'Ada lives in Leeds' }, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.recall'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(result.structuredContent).toMatchObject({
    items: [{ itemID: shortID, text: 'Sister Ada lives in Leeds' }],
  });

  expect(entries.find((entry) => entry.record.kind === 'tool_result')?.record).toMatchObject({
    erasable: {
      status: 'readable',
      fields: { result: { items: [{ itemID: item.itemID, version: 1 }], next: null } },
    },
  });

  expect(JSON.stringify(entries)).not.toInclude('Leeds');
});

test('it saves an image offer on a typed yes and leaves no readable copy of its text once the item is forgotten', async () => {
  const ctx = await setupTest();

  const photo = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Our new puppy',
    spans: [{ start: 0, end: 13, source: 'typed' }],
    images: ['image/webp'],
  });

  await runToolCall(
    {
      tool: 'memory.offer_image',
      input: { eventID: String(photo), image: 1, text: 'The owner has a beagle called Biscuit' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.offer_image'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  await writeModelReplyRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "Want me to remember this? Here's what I'd save: The owner has a beagle called Biscuit",
  });

  const answer = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'yes',
    spans: [{ start: 0, end: 3, source: 'typed' }],
  });

  // the answer's records hold no text, so the answer goes straight to the store
  const outcome = await ctx.memory.store.writes.answerOffer({
    image: { messageSequence: photo, image: 1 },
    answerSequence: answer,
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  await ctx.memory.store.forget({
    target: { itemID: outcome.itemID, version: outcome.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  // the reply that presented the offer is the conversation's own record, which its own forget removes
  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(
    JSON.stringify(entries.filter((entry) => entry.record.kind !== 'model.reply')),
  ).not.toInclude('Biscuit');
});

test('it applies a remembered fact and leaves no readable copy of its text once it is forgotten', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm allergic to hazelnuts",
    spans: [{ start: 0, end: 25, source: 'typed' }],
  });

  const result = await runToolCall(
    {
      tool: 'memory.remember',
      input: { text: 'Allergic to hazelnuts', quote: "I'm allergic to hazelnuts" },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const [item] = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['item_id', 'short_id'])
    .execute();

  invariant(item, 'the remember applied no item');

  await ctx.memory.store.forget({
    target: { itemID: item.item_id, version: 1 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  // the owner's own message keeps its words, and only the item's text is gone
  expect(result.structuredContent).toStrictEqual({
    status: 'applied',
    itemID: item.short_id,
    version: 1,
  });

  expect(JSON.stringify(entries)).not.toInclude('Allergic to hazelnuts');
});

test('it records a remember call with neither its text nor its quote, which the gate has not checked', async () => {
  const ctx = await setupTest();

  await runToolCall(
    {
      tool: 'memory.remember',
      input: { text: 'Sister Ada lives in Leeds', quote: 'Sister Ada lives in Leeds', pin: false },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.remember'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(entries.find((entry) => entry.record.kind === 'tool_called')?.record).toMatchObject({
    erasable: { status: 'readable', fields: { input: { pin: false } } },
  });
});

test.each([
  [
    'a remember with an itemID and a version',
    'memory.remember',
    { text: 'x', itemID: 'item-a', version: 1 },
  ],
  ['a remember with no text', 'memory.remember', { quote: 'x' }],
  ['an edit with no version', 'memory.edit', { itemID: 'item-a', text: 'x' }],
  ['an edit with no itemID', 'memory.edit', { version: 1, text: 'x' }],
  ['an edit with no text', 'memory.edit', { itemID: 'item-a', version: 1 }],
  ['an edit with a pin', 'memory.edit', { itemID: 'item-a', version: 1, text: 'x', pin: true }],
  ['a retire with no version', 'memory.retire', { itemID: 'item-a' }],
  ['a remember with an empty quote', 'memory.remember', { text: 'x', quote: '' }],
  [
    'a remember with an event ID that is not a number',
    'memory.remember',
    { text: 'x', eventID: 'e1' },
  ],
  [
    'an edit with an event ID of 0',
    'memory.edit',
    { itemID: 'item-a', version: 1, text: 'x', eventID: '0' },
  ],
  ['a recall with an unknown argument', 'memory.recall', { everything: true }],
  ['a recall with a cursor no page returned', 'memory.recall', { after: 'abc' }],
])('it refuses %s', async (_label, name, input) => {
  const ctx = await setupTest();

  const check = ctx.registry.findTool(name)?.parseInput(input);

  expect(check).toMatchObject({ isValid: false });
});
