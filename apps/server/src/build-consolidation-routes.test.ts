import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createConsolidationDiff,
  createMemoryItem,
  readApprovalRecords,
  startTestMemory,
} from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { startControlSocket } from './start-control-socket';

// the control socket over a test memory, as the running server opens it for host commands
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const memory = await startTestMemory();
  const path = join(dir, 'run', 'control.sock');
  const socket = await startControlSocket({
    path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  return { path, memory };
}

test('it shows the pending diff with each input at the version its change read, and the hash an answer binds to', async () => {
  const ctx = await setupTest();
  const kept = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });
  const dropped = await createMemoryItem(ctx.memory.store, {
    text: 'Has a peanut allergy',
    origin: 'task',
    source: 'untrusted',
  });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'merge',
        inputs: [kept, dropped],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
        source: 'untrusted',
      },
    ],
  });

  const response = await Bun.fetch('http://localhost/memory/consolidation', { unix: ctx.path });
  const body = await response.json();

  expect(body).toStrictEqual({
    diffID: diff.diffID,
    model: 'claude-test-1',
    createdAt: new Date(diff.createdAt).toISOString(),
    changes: [
      {
        changeID: diff.changes[0]?.changeID,
        shortID: diff.changes[0]?.shortID,
        kind: 'merge',
        inputs: [
          { ...kept, text: 'Is allergic to peanuts', isCurrent: true },
          { ...dropped, text: 'Has a peanut allergy', isCurrent: true },
        ],
        text: 'Is allergic to peanuts',
        reason: 'Both items state the same allergy.',
        source: 'untrusted',
        actionHash: diff.changes[0]?.actionHash,
        lapseAt: new Date(diff.changes[0]?.lapseAt ?? 0).toISOString(),
        comment: null,
      },
    ],
  });
});

test('it shows the comment the conversation left beside its change, and none beside the other', async () => {
  const ctx = await setupTest();
  const [joke, stale] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Calls the cat the night manager' }),
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' }),
  ]);
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      {
        kind: 'rewrite',
        inputs: [joke],
        text: 'Has a cat',
        reason: 'The wording is informal.',
        source: 'owner',
      },
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
    ],
  });
  const [rewrite, retirement] = diff.changes;

  invariant(rewrite && retirement);
  await ctx.memory.store.consolidations.comment({
    changeID: rewrite.shortID,
    text: 'The rewrite drops the joke: the cat is the night manager.',
    runID: 'run-1',
  });

  const response = await Bun.fetch('http://localhost/memory/consolidation', { unix: ctx.path });
  const body = await response.json();

  expect(body).toMatchObject({
    changes: [
      {
        changeID: rewrite.changeID,
        comment: {
          text: 'The rewrite drops the joke: the cat is the night manager.',
          at: expect.toSatisfy((at: string) => !Number.isNaN(Date.parse(at))),
        },
      },
      { changeID: retirement.changeID, comment: null },
    ],
  });
});

test('it answers null when no diff waits', async () => {
  const ctx = await setupTest();

  const response = await Bun.fetch('http://localhost/memory/consolidation', { unix: ctx.path });
  const body: unknown = await response.json();

  expect(body).toBeNull();
});

test('it approves one change as the host and leaves the rest pending', async () => {
  const ctx = await setupTest();
  const [stale, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });
  const [first, second] = diff.changes;

  invariant(first && second);

  const response = await Bun.fetch('http://localhost/memory/consolidation/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({
      answers: [{ changeID: first.changeID, actionHash: first.actionHash }],
    }),
  });
  const body = await response.json();
  const pending = await ctx.memory.store.consolidations.readPending();

  expect(body).toStrictEqual({
    outcomes: [
      { changeID: first.changeID, status: 'applied', versions: [{ ...stale, version: 2 }] },
    ],
  });
  expect(pending?.changes.map((change) => change.changeID)).toStrictEqual([second.changeID]);
});

test('it records the host as the identity that approved a change', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' }],
  });
  const [change] = diff.changes;

  invariant(change);

  await Bun.fetch('http://localhost/memory/consolidation/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({
      answers: [{ changeID: change.changeID, actionHash: change.actionHash }],
    }),
  });

  const records = await readApprovalRecords(ctx.memory.log, {
    proposalID: change.changeID,
    itemID: stale.itemID,
    actionHash: change.actionHash,
  });

  expect(records[0]).toMatchObject({
    kind: 'memory.consolidation_approved',
    payload: { identityID: 'host' },
  });
});

test('it rejects one change, which leaves the diff', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' }],
  });
  const [change] = diff.changes;

  invariant(change);

  const response = await Bun.fetch('http://localhost/memory/consolidation/reject', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ changeID: change.changeID, actionHash: change.actionHash }),
  });
  const body = await response.json();
  const pending = await ctx.memory.store.consolidations.readPending();

  expect(body).toStrictEqual({ changeID: change.changeID });
  expect(pending).toBeNull();
});

test('it answers 409 to a rejection under another action hash', async () => {
  const ctx = await setupTest();
  const stale = await createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' }],
  });
  const [change] = diff.changes;

  invariant(change);

  const response = await Bun.fetch('http://localhost/memory/consolidation/reject', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ changeID: change.changeID, actionHash: 'sha256:another' }),
  });

  expect(response.status).toBe(409);
});

test('it answers 400 to an approval with no answers', async () => {
  const ctx = await setupTest();

  const response = await Bun.fetch('http://localhost/memory/consolidation/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ answers: [] }),
  });

  expect(response.status).toBe(400);
});
