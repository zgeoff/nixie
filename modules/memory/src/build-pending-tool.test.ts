import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildPendingTool } from './build-pending-tool';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { createProposal } from './test-utils/create-proposal';
import { createWriterProposal } from './test-utils/create-writer-proposal';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const startedAt = Date.UTC(2026, 9, 13, 9, 30);

  setSystemTime(new Date(startedAt));

  onTestFinished(() => {
    setSystemTime();
  });

  const memory = await startTestMemory();

  const clock = buildTestClock(startedAt);
  const registry = buildToolRegistry([buildPendingTool(memory.store, clock)]);

  return {
    memory,
    clock,
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

test('it lists a pending proposal from the conversation and one from the note-taker, each with who noted it and why it waits', async () => {
  const ctx = await setupTest();
  const own = await createProposal(ctx.memory.store, { text: 'Waters the ferns on Sundays' });

  const noted = await createWriterProposal(ctx.memory, {
    message: 'I keep bees on the allotment.',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
  });

  ctx.clock.advance(2 * 86_400_000);

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    proposals: [
      {
        proposalID: own.proposalID,
        change: 'new',
        text: 'Waters the ferns on Sundays',
        notedBy: ['you noted it'],
        subject: 'owner',
        reason: 'no_quote',
        age: '2 days',
      },
      {
        proposalID: noted.proposalID,
        change: 'new',
        text: 'The owner keeps bees.',
        notedBy: ['the note-taker noted it'],
        subject: 'owner',
        reason: 'quote_not_typed',
        age: '2 days',
      },
    ],
  });
});

test('it leaves out a proposal the owner approved and one the owner rejected', async () => {
  const ctx = await setupTest();
  const approved = await createProposal(ctx.memory.store, { text: 'Plays chess on Tuesdays' });
  const rejected = await createProposal(ctx.memory.store, { text: 'Dislikes coriander' });
  const waiting = await createProposal(ctx.memory.store, { text: 'Owns a red kayak' });

  await ctx.memory.store.proposals.approve({
    proposalID: approved.proposalID,
    actionHash: approved.actionHash,
    identityID: 'identity-1',
  });

  await ctx.memory.store.proposals.reject({
    proposalID: rejected.proposalID,
    actionHash: rejected.actionHash,
    identityID: 'identity-1',
  });

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    proposals: [
      {
        proposalID: waiting.proposalID,
        change: 'new',
        text: 'Owns a red kayak',
        notedBy: ['you noted it'],
        subject: 'owner',
        reason: 'no_quote',
        age: 'under a minute',
      },
    ],
  });
});

test('it names both proposers of a conversation write that merged into the note-taker proposal', async () => {
  const ctx = await setupTest();

  await createWriterProposal(ctx.memory, {
    message: 'I grow tomatoes on the balcony.',
    text: 'The owner grows tomatoes.',
    quote: 'I grow tomatoes',
  });

  await ctx.memory.store.writes.remember({
    text: 'the owner grows tomatoes',
    caller: buildMockWriteCaller(),
  });

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    proposals: [
      { text: 'The owner grows tomatoes.', notedBy: ['the note-taker noted it', 'you noted it'] },
    ],
  });
});

test('it names the item that a pending edit changes by its short ID, and the version', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Cycles to work',
    provenance: buildMockProvenance(),
  });

  const proposal = await createProposal(ctx.memory.store, {
    text: 'Takes the tram to work',
    target: { itemID: item.itemID, version: 1 },
  });

  const shortIDs = await ctx.memory.store.readShortIDs([item.itemID]);

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    proposals: [
      {
        proposalID: proposal.proposalID,
        change: 'edit',
        itemID: shortIDs.get(item.itemID),
        version: 1,
        text: 'Takes the tram to work',
        notedBy: ['you noted it'],
        subject: 'owner',
        reason: 'no_quote',
        age: 'under a minute',
      },
    ],
  });
});

test('it lists a pending retirement with the text of the item it retires', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Rents a flat on Quay Street',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.writes.retire({
    target: { itemID: item.itemID, version: 1 },
    caller: buildMockWriteCaller(),
  });

  const shortIDs = await ctx.memory.store.readShortIDs([item.itemID]);

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    proposals: [
      {
        change: 'retire',
        itemID: shortIDs.get(item.itemID),
        version: 1,
        text: 'Rents a flat on Quay Street',
        notedBy: ['you noted it'],
        subject: 'owner',
      },
    ],
  });
});

test.each([
  ['under a minute', 59_000],
  ['1 minute', 60_000],
  ['59 minutes', 3_599_000],
  ['1 hour', 3_600_000],
  ['23 hours', 86_399_000],
  ['1 day', 86_400_000],
  ['12 days', 12 * 86_400_000],
])('it gives the age %s for a proposal that waited %d milliseconds', async (age, elapsed) => {
  const ctx = await setupTest();

  await createProposal(ctx.memory.store, { text: 'Bakes sourdough on Saturdays' });

  ctx.clock.advance(elapsed);

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({ proposals: [{ age }] });
});

test('it lists nothing when no proposal waits', async () => {
  const ctx = await setupTest();

  const result = await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({ proposals: [] });
});

test('it records only the proposal IDs, never the proposed text', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Collects tin robots' });

  await runToolCall(
    { tool: 'memory.pending', input: {}, toolUseID: null },
    {
      runID: 'run-1',
      thread: 'conversation',
      tools: ['memory.pending'],
      model: { model: 'test-model', profile: 'standard' },
    },
    ctx.toolCallOptions,
  );

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  expect(entries.find((entry) => entry.record.kind === 'tool_result')?.record).toMatchObject({
    erasable: {
      status: 'readable',
      fields: { result: { proposals: [{ proposalID: proposal.proposalID }] } },
    },
  });

  expect(JSON.stringify(entries)).not.toInclude('tin robots');
});
