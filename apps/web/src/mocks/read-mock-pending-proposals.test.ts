import { expect, test } from 'bun:test';
import { readMockPendingProposals } from './read-mock-pending-proposals';
import { store } from './store';
import { writeMockMemoryForget } from './write-mock-memory-forget';

test('it reads a pending proposal as the API lists it', async () => {
  const proposal = await store.memoryProposals.create({
    actionHash: 'sha256:1f0e',
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    evidence: {
      end: 22,
      message: { status: 'readable', text: 'I keep bees on the roof' },
      sequence: 4,
      start: 2,
    },
    itemID: '3d7b9e1a-6c2f-4e8d-b0a5-9f1c4e7a2d63',
    subject: 'owner',
    lapseAt: new Date(Date.now() + 86_400_000),
    operation: 'remember',
    origin: 'memory_writer',
    proposalID: '7a2c5e9f-0b4d-4f1a-8e6c-2d9b7f3a5c10',
    quote: 'keep bees on the roof',
    reason: 'no_quote',
    source: 'untrusted',
    targetVersion: null,
    text: 'Keeps bees on the roof',
    thread: 'conversation',
  });

  expect(readMockPendingProposals()).toStrictEqual([
    {
      actionHash: 'sha256:1f0e',
      createdAt: new Date('2026-10-01T09:00:00.000Z'),
      evidence: {
        end: 22,
        message: { status: 'readable', text: 'I keep bees on the roof' },
        sequence: 4,
        start: 2,
      },
      image: null,
      isPinned: false,
      isSensitive: false,
      itemID: '3d7b9e1a-6c2f-4e8d-b0a5-9f1c4e7a2d63',
      kind: 'fact',
      subject: 'owner',
      lapseAt: proposal.lapseAt,
      newSubject: null,
      operation: 'remember',
      origin: 'memory_writer',
      proposalID: '7a2c5e9f-0b4d-4f1a-8e6c-2d9b7f3a5c10',
      quote: 'keep bees on the roof',
      reason: 'no_quote',
      source: 'untrusted',
      sources: [
        {
          origin: 'memory_writer',
          proposedAt: new Date('2026-10-01T09:00:00.000Z'),
          thread: 'conversation',
        },
      ],
      targetVersion: null,
      text: 'Keeps bees on the roof',
      until: null,
    },
  ]);
});

test('it reads the pending proposals oldest first, with none answered or past its lapse time', async () => {
  const newer = await store.memoryProposals.create({ createdAt: new Date('2026-10-02') });
  const older = await store.memoryProposals.create({ createdAt: new Date('2026-10-01') });

  await store.memoryProposals.create({ status: 'rejected' });
  await store.memoryProposals.create({ lapseAt: new Date(Date.now() - 1000) });

  expect(readMockPendingProposals().map((proposal) => proposal.proposalID)).toStrictEqual([
    older.proposalID,
    newer.proposalID,
  ]);
});

test('it no longer reads the text of a forgotten item’s proposals', async () => {
  const item = await store.memoryItems.create({ versions: [{ text: 'Keeps bees on the roof' }] });

  await store.memoryProposals.create({
    itemID: item.itemID,
    operation: 'retire',
    targetVersion: 1,
    text: 'Keeps bees on the roof',
  });

  await writeMockMemoryForget({
    clientActionID: '9c4e1a7f-2b6d-4e0a-8f3c-5d1b7e9a2c64',
    itemID: item.itemID,
    version: 1,
  });

  expect(readMockPendingProposals()).toStrictEqual([]);
});

test('it no longer reads the proposals of an item whose stalled forget a retry completed', async () => {
  const item = await store.memoryItems.create({
    failsForgetCleanup: true,
    isShredded: false,
    versions: [{ text: 'Keeps bees on the roof' }],
  });

  await store.memoryProposals.create({
    itemID: item.itemID,
    operation: 'retire',
    targetVersion: 1,
    text: 'Keeps bees on the roof',
  });

  await writeMockMemoryForget({
    clientActionID: '6b3f9d2e-4a1c-4e7b-8d5f-0c2a6e9b1f38',
    itemID: item.itemID,
    version: 1,
  });

  await writeMockMemoryForget({
    clientActionID: '6b3f9d2e-4a1c-4e7b-8d5f-0c2a6e9b1f38',
    itemID: item.itemID,
    version: 1,
  });

  expect(readMockPendingProposals()).toStrictEqual([]);
});

test('it reads the proposals of a forgetting item whose cleanup stalled before it removed the key', async () => {
  const item = await store.memoryItems.create({
    isShredded: false,
    state: 'forgetting',
    versions: [{ text: 'Keeps bees on the roof' }],
  });

  await store.memoryProposals.create({
    itemID: item.itemID,
    operation: 'retire',
    targetVersion: 1,
    text: 'Keeps bees on the roof',
  });

  expect(readMockPendingProposals()).toMatchObject([{ text: 'Keeps bees on the roof' }]);
});
