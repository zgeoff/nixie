import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProposal, startTestMemory } from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { sendMemoryRequest } from './send-memory-request';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const memory = await startTestMemory();

  const socket = await startControlSocket({
    path: join(dir, 'control.sock'),
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    runReset: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  return { path: join(dir, 'control.sock'), memory };
}

test('it returns the pending proposals the running server lists', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });
  const pending = await sendMemoryRequest(ctx.path, { command: 'pending' });

  expect(pending).toMatchObject([
    { proposalID: proposal.proposalID, actionHash: proposal.actionHash, text: 'Likes jazz' },
  ]);
});

test('it returns the version an approval applied', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const ref = await sendMemoryRequest(ctx.path, {
    command: 'approve',
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
  });

  expect(ref).toStrictEqual({ status: 'applied', itemID: proposal.itemID, version: 1 });
});

test('it sends an approval held for a close match again as a new item, or as a revision', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The owner swims every Tuesday.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const [kept, revised] = await Promise.all(
    ['Owner swims every Tuesday', 'The owner swims every Tuesday morning'].map((text) =>
      createProposal(ctx.memory.store, { text }),
    ),
  );

  invariant(kept && revised);

  const asNew = await sendMemoryRequest(ctx.path, {
    command: 'approve',
    proposalID: kept.proposalID,
    actionHash: kept.actionHash,
    ignoreCloseMatch: true,
  });

  const asRevision = await sendMemoryRequest(ctx.path, {
    command: 'approve',
    proposalID: revised.proposalID,
    actionHash: revised.actionHash,
    revisionOf: { itemID: item.itemID, version: 1 },
  });

  expect(asNew).toStrictEqual({ status: 'applied', itemID: kept.itemID, version: 1 });
  expect(asRevision).toStrictEqual({ status: 'applied', itemID: item.itemID, version: 2 });
});

test('it returns the proposal a rejection answered', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const answered = await sendMemoryRequest(ctx.path, {
    command: 'reject',
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
  });

  expect(answered).toStrictEqual({ proposalID: proposal.proposalID });
});

test('it rejects with the status and the reason when the server refuses the answer', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  expect(
    sendMemoryRequest(ctx.path, {
      command: 'approve',
      proposalID: proposal.proposalID,
      actionHash: 'sha256:other',
    }),
  ).rejects.toThrowWithMessage(
    Error,
    `nixie answered the memory approve request with 409: the answer to memory proposal ${proposal.proposalID} names another action hash`,
  );
});

test('it sends an approval with your edited text in place of the proposal’s', async () => {
  const ctx = await setupTest();
  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jaz' });

  const ref = await sendMemoryRequest(ctx.path, {
    command: 'approve',
    proposalID: proposal.proposalID,
    actionHash: proposal.actionHash,
    editedText: 'Likes jazz',
  });

  const history = await ctx.memory.store.readHistory(proposal.itemID);

  expect(ref).toStrictEqual({ status: 'applied', itemID: proposal.itemID, version: 1 });
  expect(history?.versions).toMatchObject([{ origin: 'owner', text: 'Likes jazz' }]);
});

test('it returns an item with its history, and the version an edit added', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Drinks oat milk',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await sendMemoryRequest(ctx.path, {
    command: 'edit',
    target: item,
    text: 'Drinks soy milk',
  });

  const shown = await sendMemoryRequest(ctx.path, { command: 'show', itemID: item.itemID });

  expect(edited).toStrictEqual({ itemID: item.itemID, version: 2 });

  expect(shown).toMatchObject({
    itemID: item.itemID,
    state: 'active',
    versions: [
      { version: 1, change: 'created', text: 'Drinks oat milk' },
      { version: 2, change: 'edited', origin: 'owner', text: 'Drinks soy milk' },
    ],
  });
});

test('it returns the versions a retirement and a restore added', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives in Lisbon',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await sendMemoryRequest(ctx.path, { command: 'retire', target: item });

  const restored = await sendMemoryRequest(ctx.path, {
    command: 'restore',
    target: { itemID: item.itemID, version: 2 },
  });

  expect(retired).toStrictEqual({ itemID: item.itemID, version: 2 });
  expect(restored).toStrictEqual({ itemID: item.itemID, version: 3 });
});

test('it returns the pin it set', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Is allergic to peanuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pinned = await sendMemoryRequest(ctx.path, {
    command: 'pin',
    itemID: item.itemID,
    isPinned: true,
  });

  expect(pinned).toStrictEqual({ itemID: item.itemID, isPinned: true });
});
