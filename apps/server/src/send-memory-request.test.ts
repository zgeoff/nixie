import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProposal, startTestMemory } from '@heynixie/memory/test-utils';
import { sendMemoryRequest } from './send-memory-request';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const memory = await startTestMemory();
  const socket = await startControlSocket({
    path: join(dir, 'control.sock'),
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readProposals: () => memory.store.proposals,
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

  expect(ref).toStrictEqual({ itemID: proposal.itemID, version: 1 });
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
