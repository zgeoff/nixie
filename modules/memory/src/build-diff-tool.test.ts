import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildDiffTool } from './build-diff-tool';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  setSystemTime(new Date(Date.UTC(2026, 9, 12, 3, 0)));

  onTestFinished(() => {
    setSystemTime();
  });

  const memory = await startTestMemory();

  const registry = buildToolRegistry([buildDiffTool(memory.store)]);

  return {
    memory,
    toolCallOptions: {
      registry,

      decide: () => ({
        decision: { outcome: 'allow' as const, stage: 3, rule: null },
        sentence: null,
      }),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      queue: {
        enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  };
}

test('it shows a pending merge with its reason, each input by short ID and the text it writes', async () => {
  const ctx = await setupTest();

  const [first, second] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee with oat milk' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [first, second],
        text: 'Takes oat milk in coffee',
        reason: 'Both items say the same thing.',
        source: 'owner',
      },
    ],
  });

  const firstID = await readItemShortID(ctx.memory.log, first.itemID);
  const secondID = await readItemShortID(ctx.memory.log, second.itemID);

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    proposedAt: '2026-10-12 03:00 UTC',
    changes: [
      {
        changeID: diff.changes[0]?.shortID,
        kind: 'merge',
        inputs: [
          { itemID: firstID, version: 1, text: 'Takes oat milk in coffee', isCurrent: true },
          { itemID: secondID, version: 1, text: 'Drinks coffee with oat milk', isCurrent: true },
        ],
        text: 'Takes oat milk in coffee',
        reason: 'Both items say the same thing.',
      },
    ],
  });
});

test('it shows every pending change in the order the run proposed it, a retirement with no text', async () => {
  const ctx = await setupTest();

  const [trip, stale] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
    createMemoryItem(ctx.memory.store, { text: 'Sees the dentist on Friday' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
      { kind: 'retire', inputs: [stale], reason: 'The appointment has passed.', source: 'owner' },
    ],
  });

  const tripID = await readItemShortID(ctx.memory.log, trip.itemID);
  const staleID = await readItemShortID(ctx.memory.log, stale.itemID);

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    proposedAt: '2026-10-12 03:00 UTC',
    changes: [
      {
        changeID: diff.changes[0]?.shortID,
        kind: 'retire',
        inputs: [{ itemID: tripID, version: 1, text: 'Is in Lisbon until May', isCurrent: true }],
        reason: 'The trip has ended.',
      },
      {
        changeID: diff.changes[1]?.shortID,
        kind: 'retire',
        inputs: [
          { itemID: staleID, version: 1, text: 'Sees the dentist on Friday', isCurrent: true },
        ],
        reason: 'The appointment has passed.',
      },
    ],
  });
});

test('it names each change by a short ID and never shows the action hash an answer binds to', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Lives near the river' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Lives by the river',
        reason: 'Shorter.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(change.shortID).toMatch(/^[a-z][0-9a-z]{9}$/u);
  expect(JSON.stringify(result.structuredContent)).not.toInclude(change.changeID);
  expect(JSON.stringify(result.structuredContent)).not.toInclude(change.actionHash);
});

test('it shows the comment left on a change beside that change', async () => {
  const ctx = await setupTest();

  const item = await createMemoryItem(ctx.memory.store, {
    text: 'Says the bike is held together by optimism',
  });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Has an old bike',
        reason: 'Plainer wording.',
        source: 'owner',
      },
    ],
  });

  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.comment({
    changeID: change.shortID,
    text: 'The optimism is the point of this one.',
    runID: 'run-0',
  });

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    changes: [{ changeID: change.shortID, comment: 'The optimism is the point of this one.' }],
  });
});

test('it shows no text of an item once its forget has started, before its key is gone', async () => {
  const ctx = await setupTest();

  const [secret, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Hides the spare key under the blue pot' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [secret], reason: 'Stale.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { itemID: secret.itemID, version: 1, evidenceSequences: [] },
    },
  ]);

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(JSON.stringify(result.structuredContent)).not.toInclude('blue pot');

  expect(result.structuredContent).toMatchObject({
    changes: [{ changeID: diff.changes[1]?.shortID, reason: 'The trip has ended.' }],
  });
});

test('it leaves out a merge whose later input was forgotten, because its text can hold that input', async () => {
  const ctx = await setupTest();

  const [kept, forgotten] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Sees a therapist' }),
    createMemoryItem(ctx.memory.store, { text: 'Sees Dr Okafor on Thursdays' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, forgotten],
        text: 'Sees Dr Okafor, a therapist, on Thursdays',
        reason: 'Both items name the same appointment.',
        source: 'owner',
      },
    ],
  });

  await ctx.memory.store.forget({
    target: forgotten,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({ changes: [] });
});

test('it shows no changes when no diff waits', async () => {
  const ctx = await setupTest();

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({ changes: [] });
});

test('it records only the change IDs of its result, never a text', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps a tin of brass buttons' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Collects brass buttons',
        reason: 'Clearer.',
        source: 'owner',
      },
    ],
  });

  await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(entries.find((entry) => entry.record.kind === 'tool_result')?.record).toMatchObject({
    erasable: {
      status: 'readable',
      fields: { result: { changes: [{ changeID: diff.changes[0]?.changeID }] } },
    },
  });

  expect(JSON.stringify(entries)).not.toInclude('brass buttons');
});

test('it shows the summary the consolidator left beside the changes, and records no word of it', async () => {
  const ctx = await setupTest();

  const [oat, black, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' }],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: [oat.itemID, black.itemID, trip.itemID],
    },
  });

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(result.structuredContent).toMatchObject({
    changes: [{ changeID: diff.changes[0]?.shortID, kind: 'retire' }],
    summary: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
  });

  expect(JSON.stringify(entries)).not.toInclude('oat milk');
});

test('it shows the summary of a run that proposed no change', async () => {
  const ctx = await setupTest();

  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: [oat.itemID, black.itemID],
    },
  });

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    proposedAt: '2026-10-12 03:00 UTC',
    changes: [],
    summary: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
  });
});

test('it leaves out the summary once a forget starts on an item it is sealed under, before its key is gone', async () => {
  const ctx = await setupTest();

  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: [oat.itemID, black.itemID],
    },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { itemID: oat.itemID, version: 1, evidenceSequences: [] },
    },
  ]);

  const result = await runToolCall(
    { tool: 'memory.diff', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.diff'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({ changes: [] });
});
