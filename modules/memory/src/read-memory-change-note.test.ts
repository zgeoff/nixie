import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readMemoryChangeNote } from './read-memory-change-note';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it renders no note when memory did not change', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Hello there.' },
    },
  ]);

  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  invariant(message);

  expect(note).toStrictEqual({ text: null, throughSequence: message.sequence });
});

test('it lists a change made outside the conversation and leaves out the conversation own', async () => {
  const ctx = await setupTest();

  const street = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const shortID = await readItemShortID(ctx.memory.log, street.itemID);
  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  expect(note.text).toBe(
    [
      'Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.',
      `- Remembered [${shortID}]: Lives on Elm Street`,
    ].join('\n'),
  );
});

test('it counts the catch-up versions without listing them', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
    },
  });

  await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
    },
  });

  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  expect(note.text).toBe(
    [
      'Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.',
      '- Took in 2 things from earlier conversation',
    ].join('\n'),
  );
});

test('it lists a writer version from after the catch-up ended', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 0,
        mode: 'catch_up',
        at: 1_000_100,
        applied: [],
        proposed: 0,
        dropped: 0,
        catchUpEnded: true,
        model: null,
        profile: null,
        usage: null,
      },
    },
  ]);

  const street = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
    },
  });

  const shortID = await readItemShortID(ctx.memory.log, street.itemID);
  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  expect(note.text).toInclude(`- Remembered [${shortID}]: Lives on Elm Street`);
});

test('it starts after the last turn that ended', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {},
    },
  ]);

  const bees = await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortID = await readItemShortID(ctx.memory.log, bees.itemID);
  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  expect(note.text).toBe(
    [
      'Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.',
      `- Remembered [${shortID}]: Keeps bees on the roof`,
    ].join('\n'),
  );
});

test('it starts after the sequence the last turn noted through', async () => {
  const ctx = await setupTest();

  const street = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { memoryNotedThrough: 0 },
    },
  ]);

  const shortID = await readItemShortID(ctx.memory.log, street.itemID);
  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  expect(note.text).toInclude(`- Remembered [${shortID}]: Lives on Elm Street`);
});

test('it lists changes up to the cap and counts the rest', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Keeps bees on the roof',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Plays the cello',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 1 });

  expect(note.text).toMatch(/^[^\n]+\n- Remembered \[[^\]]+\]: Lives on Elm Street\nand 2 more$/u);
});

test("it names each of the conversation's proposals that a write from outside merged into, and no merge of the conversation's own", async () => {
  const ctx = await setupTest();

  const caller = {
    origin: 'conversation' as const,
    thread: 'conversation',
    taskID: 'conversation',
    runID: 'run-1',
    model: 'claude-test-1',
  };

  const first = await ctx.memory.store.writes.remember({ text: 'Keeps bees', caller });

  await ctx.memory.store.writes.remember({ text: 'Keeps bees', caller });

  await ctx.memory.store.writes.remember({
    text: 'Keeps bees',
    caller: { ...caller, origin: 'task', thread: 'task-7', taskID: 'task-7' },
  });

  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  invariant(first.status === 'proposed');

  expect(note.text).toBe(
    [
      'Memory changed since your last turn, outside this conversation. Where these differ from anything said earlier, these hold.',
      `- A task proposed the same memory again; it merged into your pending proposal [${first.proposalID}], which still waits for the owner's review`,
    ].join('\n'),
  );
});

test('it leaves out a merge into a proposal that closed before the next turn', async () => {
  const ctx = await setupTest();

  const caller = {
    origin: 'conversation' as const,
    thread: 'conversation',
    taskID: 'conversation',
    runID: 'run-1',
    model: 'claude-test-1',
  };

  await ctx.memory.store.writes.remember({ text: 'Keeps bees', caller });

  await ctx.memory.store.writes.remember({
    text: 'Keeps bees',
    caller: { ...caller, origin: 'task', thread: 'task-7', taskID: 'task-7' },
  });

  const [pending] = await ctx.memory.store.proposals.listPending();

  invariant(pending);

  await ctx.memory.store.proposals.reject({ ...pending, identityID: 'identity-1' });

  const note = await readMemoryChangeNote(ctx.memory.log, ctx.memory.store, { cap: 5 });

  expect(note.text).toBeNull();
});
