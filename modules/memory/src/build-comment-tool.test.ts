import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { buildCommentTool } from './build-comment-tool';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

// A test memory on a test clock, memory.comment in a registry, and the options a call runs under,
// which record each call and its result in the memory's log.
async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));
  const memory = await startTestMemory({ gate: { clock } });
  const registry = buildToolRegistry([buildCommentTool(memory.store)]);

  return {
    memory,
    clock,
    toolCallOptions: {
      registry,

      // every call is allowed, so each reaches its tool
      decide: () => ({
        decision: { outcome: 'allow' as const, stage: 3, rule: null },
        sentence: null,
      }),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      // memory.comment runs direct, so nothing reaches the queue
      queue: {
        enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  };
}

test('it keeps the comment beside the change it names, which still waits under the same action hash', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, {
    text: 'Calls the vacuum cleaner Gerald',
  });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Owns a vacuum cleaner',
        reason: 'The name adds nothing.',
        source: 'owner',
      },
    ],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);

  const result = await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.shortID, comment: 'The name is the whole memory.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );
  const pending = await ctx.memory.store.consolidations.readPending();

  expect(result.structuredContent).toStrictEqual({
    changeID: change.shortID,
    status: 'commented',
  });
  expect(pending?.changes).toStrictEqual([
    { ...change, comment: { text: 'The name is the whole memory.', at: expect.toBeNumber() } },
  ]);
});

test('it replaces the comment a change held with a second one', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Plays the ukulele badly' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Plays the ukulele',
        reason: 'Neutral.',
        source: 'owner',
      },
    ],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);
  await ctx.memory.store.consolidations.comment({
    changeID: change.shortID,
    text: 'Keep it.',
    runID: 'run-1',
  });

  await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.shortID, comment: '"Badly" is the joke, so keep it.' },
      toolUseID: null,
    },
    {
      runID: 'run-2',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );
  const pending = await ctx.memory.store.consolidations.readPending();

  expect(pending?.changes[0]?.comment?.text).toBe('"Badly" is the joke, so keep it.');
});

test('it takes the change by its UUID as well as its short ID, and answers with the short ID', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'It has passed.', source: 'owner' }],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);

  const result = await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.changeID, comment: 'Fine to drop.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );
  const pending = await ctx.memory.store.consolidations.readPending();

  expect(result.structuredContent).toStrictEqual({
    changeID: change.shortID,
    status: 'commented',
  });
  expect(pending?.changes[0]?.comment?.text).toBe('Fine to drop.');
});

test('it answers the model that no change has the ID it names', async () => {
  const ctx = await setupTest();

  const result = await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: 'q8w2e4r6t0', comment: 'Looks right.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({
    isError: true,
    content: [
      { type: 'text', text: expect.toInclude('no consolidation change q8w2e4r6t0 exists') },
    ],
  });
});

test('it answers the model that a change the owner rejected takes no comment', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip ended.', source: 'owner' }],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);
  await ctx.memory.store.consolidations.reject({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'host',
  });

  const result = await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.shortID, comment: 'Agreed.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: expect.toInclude(
          `consolidation change ${change.shortID} is rejected, so it takes no comment`,
        ),
      },
    ],
  });
});

test('it answers the model that a change past its lapse time takes no comment', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip ended.', source: 'owner' }],
    now: ctx.clock.now(),
    lapseMs: 60_000,
  });
  const [change] = diff.changes;

  invariant(change);
  ctx.clock.advance(60_000);

  const result = await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.shortID, comment: 'Agreed.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: expect.toInclude(
          `consolidation change ${change.shortID} is lapsed, so it takes no comment`,
        ),
      },
    ],
  });
});

test('it answers the model that a change whose first input was forgotten takes no comment', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'Stale.', source: 'owner' }],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);
  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.shortID, comment: 'Agreed.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: expect.toInclude(
          `consolidation change ${change.shortID} is forgotten, so it takes no comment`,
        ),
      },
    ],
  });
});

test('it leaves the change for the owner to approve after a comment', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'It has passed.', source: 'owner' }],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);
  await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.shortID, comment: 'Fine to drop.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const versions = await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'host',
  });

  expect(versions).toStrictEqual([{ itemID: item.itemID, version: 2 }]);
});

test('it keeps the comment text out of every record but its sealed copy', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Hums while cooking' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [item],
        text: 'Hums',
        reason: 'Shorter.',
        source: 'owner',
      },
    ],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);

  await runToolCall(
    {
      tool: 'memory.comment',
      input: { changeID: change.shortID, comment: 'Cooking is where the humming happens.' },
      toolUseID: null,
    },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.comment'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );
  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(
    entries.find((entry) => entry.record.kind === 'memory.consolidation_commented')?.record,
  ).toMatchObject({
    thread: 'memory-consolidator',
    payload: { changeID: change.changeID, runID: 'run-1', sealed: expect.toBeString() },
  });
  expect(JSON.stringify(entries)).not.toInclude('humming happens');
});
