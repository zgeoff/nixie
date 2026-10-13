import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecords } from '@heynixie/log';
import {
  buildMockWriteCaller,
  createProposal,
  readApprovalRecords,
  startTestMemory,
} from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { startControlSocket } from './start-control-socket';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-control-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const memory = await startTestMemory();

  return { path: join(dir, 'run', 'control.sock'), memory };
}

test('it issues an enrolment code to a request on the socket', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () =>
      Promise.resolve({ code: 'ABCD-EFGH', expiresAt: new Date('2026-10-11T12:15:00.000Z') }),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/enrolment-codes', {
    method: 'POST',
    unix: ctx.path,
  });
  const body = await response.json();

  expect(body).toStrictEqual({
    code: 'ABCD-EFGH',
    expiresAt: '2026-10-11T12:15:00.000Z',
  });
});

test('it keeps the socket in a directory only nixie’s user may enter', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const dir = await stat(join(ctx.path, '..'));

  expect(dir.mode & 0o777).toBe(0o700);
});

test('it answers any other request with 404', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/sessions', { method: 'POST', unix: ctx.path });

  expect(response.status).toBe(404);
});

test('it answers 500 with the reason when the code cannot be issued', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('the database is locked')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/enrolment-codes', {
    method: 'POST',
    unix: ctx.path,
  });
  const reason = await response.text();

  expect(response.status).toBe(500);
  expect(reason).toBe('the database is locked');
});

test('it lists the live device sessions', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () =>
      Promise.resolve([
        {
          sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
          deviceName: 'Browser',
          createdAt: new Date('2026-10-01T09:00:00.000Z'),
          lastUsedAt: new Date('2026-10-13T08:30:00.000Z'),
        },
      ]),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/sessions', { unix: ctx.path });
  const body = await response.json();

  expect(body).toStrictEqual([
    {
      sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
      deviceName: 'Browser',
      createdAt: '2026-10-01T09:00:00.000Z',
      lastUsedAt: '2026-10-13T08:30:00.000Z',
    },
  ]);
});

test('it sets the label of a session and answers with the label it kept', async () => {
  const ctx = await setupTest();
  const updateSessionLabel = mock(() =>
    Promise.resolve({
      status: 'labelled' as const,
      sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
      label: 'work PC',
    }),
  );
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel,
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/sessions/label', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e', label: 'work  PC' }),
  });
  const body = await response.json();

  expect(updateSessionLabel).toHaveBeenCalledExactlyOnceWith({
    sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
    label: 'work  PC',
  });
  expect(body).toStrictEqual({
    sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e',
    label: 'work PC',
  });
});

test('it answers 404 to a label for a session that is not signed in', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.resolve({ status: 'not_found' as const }),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/sessions/label', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e', label: 'phone' }),
  });
  const reason = await response.text();

  expect(response.status).toBe(404);
  expect(reason).toBe('no device session that is still signed in has that ID');
});

test('it answers 400 to a label the session cannot take', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.resolve({ status: 'invalid_label' as const }),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/sessions/label', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ sessionID: '7d2c4e6a-8b0f-4a1c-9e3d-5f7a9b1c3d5e', label: ' ' }),
  });
  const reason = await response.text();

  expect(response.status).toBe(400);
  expect(reason).toBe('a label holds 1 to 100 characters besides spaces');
});

test('it answers 400 to a label request with no session ID', async () => {
  const ctx = await setupTest();
  const updateSessionLabel = mock(() => Promise.reject(new Error('unused')));
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel,
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/sessions/label', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ label: 'phone' }),
  });
  const reason = await response.text();

  expect(response.status).toBe(400);
  expect(reason).toBe('a label takes a sessionID and a label');
  expect(updateSessionLabel).not.toHaveBeenCalled();
});

test('it lists each pending memory proposal with its text and the hash an answer binds to', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const response = await Bun.fetch('http://localhost/memory/proposals', { unix: ctx.path });
  const body = await response.json();

  expect(body).toStrictEqual([
    {
      proposalID: proposal.proposalID,
      operation: 'remember',
      itemID: proposal.itemID,
      targetVersion: null,
      isPinned: false,
      reason: 'no_quote',
      actionHash: proposal.actionHash,
      origin: 'conversation',
      source: 'untrusted',
      createdAt: new Date(proposal.createdAt).toISOString(),
      lapseAt: new Date(proposal.lapseAt).toISOString(),
      sources: [
        {
          origin: 'conversation',
          thread: 'conversation',
          proposedAt: new Date(proposal.createdAt).toISOString(),
        },
      ],
      text: 'Likes jazz',
      quote: null,
    },
  ]);
});

test('it answers an approval that an active item closely matches with that item, and applies nothing', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'The owner swims every Tuesday.',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const proposal = await createProposal(ctx.memory.store, { text: 'Owner swims every Tuesday' });

  const held = await Bun.fetch('http://localhost/memory/proposals/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ proposalID: proposal.proposalID, actionHash: proposal.actionHash }),
  });
  const [body, pending] = await Promise.all([
    held.json(),
    ctx.memory.store.proposals.listPending(),
  ]);

  expect(body).toStrictEqual({
    status: 'close_match',
    item: { itemID: item.itemID, version: 1, text: 'The owner swims every Tuesday.' },
  });
  expect(pending).toMatchObject([{ proposalID: proposal.proposalID }]);
});

test('it writes the same records for an approval as the memory gate’s own approval path', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const throughGate = await createProposal(ctx.memory.store, {
    text: 'Likes jazz',
    caller: buildMockWriteCaller({ model: 'claude-test-1' }),
  });
  const throughSocket = await createProposal(ctx.memory.store, {
    text: 'Likes tea',
    caller: buildMockWriteCaller({ model: 'claude-test-1' }),
  });

  await ctx.memory.store.proposals.approve({
    proposalID: throughGate.proposalID,
    actionHash: throughGate.actionHash,
    identityID: 'host',
  });
  await Bun.fetch('http://localhost/memory/proposals/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({
      proposalID: throughSocket.proposalID,
      actionHash: throughSocket.actionHash,
    }),
  });
  const [gateRecords, socketRecords] = await Promise.all([
    readApprovalRecords(ctx.memory.log, throughGate),
    readApprovalRecords(ctx.memory.log, throughSocket),
  ]);

  expect(gateRecords.map((record) => record['kind'])).toStrictEqual([
    'memory.approval_recorded',
    'memory.version_added',
  ]);
  expect(socketRecords).toStrictEqual(gateRecords);
});

test('it rejects a memory proposal, which leaves the pending list', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const response = await Bun.fetch('http://localhost/memory/proposals/reject', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ proposalID: proposal.proposalID, actionHash: proposal.actionHash }),
  });
  const [body, records, pending] = await Promise.all([
    response.json(),
    readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.proposal_rejected'] }),
    ctx.memory.store.proposals.listPending(),
  ]);

  expect(body).toStrictEqual({ proposalID: proposal.proposalID });
  expect(records.map((entry) => entry.record.payload)).toStrictEqual([
    { proposalID: proposal.proposalID },
  ]);
  expect(pending).toStrictEqual([]);
});

test('it answers 409 to an answer under another action hash, and applies nothing', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const response = await Bun.fetch('http://localhost/memory/proposals/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ proposalID: proposal.proposalID, actionHash: 'sha256:other' }),
  });
  const reason = await response.text();
  const pending = await ctx.memory.store.proposals.listPending();

  expect(response.status).toBe(409);
  expect(reason).toBe(
    `the answer to memory proposal ${proposal.proposalID} names another action hash`,
  );
  expect(pending.map((entry) => entry.proposalID)).toStrictEqual([proposal.proposalID]);
});

test('it answers 404 to an answer for a memory proposal that does not exist', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/memory/proposals/reject', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ proposalID: 'proposal-1', actionHash: 'sha256:any' }),
  });

  expect(response.status).toBe(404);
});

test('it answers 400 to an answer with no action hash', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/memory/proposals/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ proposalID: 'proposal-1' }),
  });
  const reason = await response.text();

  expect(response.status).toBe(400);
  expect(reason).toBe(
    'an answer takes a proposalID and an actionHash, and edited text of 1 to 2,000 characters',
  );
});

test('it answers 503 to a memory request before the memory store starts', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => null,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/memory/proposals', { unix: ctx.path });
  const reason = await response.text();

  expect(response.status).toBe(503);
  expect(reason).toBe('the memory store has not started yet');
});

test('it shows a memory item with its state and every version, oldest first', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'Drinks oat milk',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const history = await ctx.memory.store.readHistory(item.itemID);

  invariant(history);

  const response = await Bun.fetch(`http://localhost/memory/items/${item.itemID}`, {
    unix: ctx.path,
  });
  const body = await response.json();

  expect(body).toStrictEqual({
    itemID: item.itemID,
    state: 'active',
    versions: [
      {
        version: 1,
        change: 'created',
        state: 'active',
        origin: 'owner',
        source: 'owner',
        recordedAt: new Date(history.versions[0]?.recordedAt ?? 0).toISOString(),
        status: 'readable',
        text: 'Drinks oat milk',
      },
    ],
  });
});

test('it answers 404 to a memory item that does not exist', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch(
    'http://localhost/memory/items/0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f',
    { unix: ctx.path },
  );
  const reason = await response.text();

  expect(response.status).toBe(404);
  expect(reason).toBe('no memory item has that ID');
});

test('it edits a memory item as a new version of yours, and keeps the old one in its history', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await createProposal(ctx.memory.store, { text: 'Likes jaz' }).then((proposal) =>
    ctx.memory.store.proposals.approve({
      proposalID: proposal.proposalID,
      actionHash: proposal.actionHash,
      identityID: 'host',
    }),
  );

  invariant(item.status === 'applied');

  const response = await Bun.fetch('http://localhost/memory/items/edit', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ itemID: item.itemID, version: 1, text: 'Likes jazz' }),
  });
  const [body, history] = await Promise.all([
    response.json(),
    ctx.memory.store.readHistory(item.itemID),
  ]);

  expect(body).toStrictEqual({ itemID: item.itemID, version: 2 });
  expect(history?.versions).toMatchObject([
    { version: 1, change: 'created', origin: 'conversation', text: 'Likes jaz' },
    { version: 2, change: 'edited', origin: 'owner', source: 'owner', text: 'Likes jazz' },
  ]);
});

test('it answers 409 to an edit of a version the item has moved past, and adds none', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'Walks to work',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Cycles to work',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const response = await Bun.fetch('http://localhost/memory/items/edit', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ itemID: item.itemID, version: 1, text: 'Runs to work' }),
  });
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(response.status).toBe(409);
  expect(history?.versions.map((version) => version.version)).toStrictEqual([1, 2]);
});

test('it answers 400 to an edit with blank text', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/memory/items/edit', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({
      itemID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f',
      version: 1,
      text: '  ',
    }),
  });
  const reason = await response.text();

  expect(response.status).toBe(400);
  expect(reason).toBe(
    'an edit takes an itemID, the version it read, and text of 1 to 2,000 characters',
  );
});

test('it retires a memory item as your own change', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'Lives in Lisbon',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const response = await Bun.fetch('http://localhost/memory/items/retire', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ itemID: item.itemID, version: 1 }),
  });
  const [body, history] = await Promise.all([
    response.json(),
    ctx.memory.store.readHistory(item.itemID),
  ]);

  expect(body).toStrictEqual({ itemID: item.itemID, version: 2 });
  expect(history).toMatchObject({
    state: 'retired',
    versions: [
      { version: 1, change: 'created', state: 'active' },
      { version: 2, change: 'retired', state: 'retired', origin: 'owner', text: 'Lives in Lisbon' },
    ],
  });
});

test('it restores a retired memory item as your own change', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'Lives in Lisbon',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const response = await Bun.fetch('http://localhost/memory/items/restore', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify(retired),
  });
  const [body, history] = await Promise.all([
    response.json(),
    ctx.memory.store.readHistory(item.itemID),
  ]);

  expect(body).toStrictEqual({ itemID: item.itemID, version: 3 });
  expect(history).toMatchObject({
    state: 'active',
    versions: [
      { version: 1 },
      { version: 2, change: 'retired' },
      { version: 3, change: 'restored', state: 'active', origin: 'owner', text: 'Lives in Lisbon' },
    ],
  });
});

test('it answers 409 to a restore of an item that is not retired', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'Lives in Lisbon',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const response = await Bun.fetch('http://localhost/memory/items/restore', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify(item),
  });

  expect(response.status).toBe(409);
});

test('it pins a memory item into the pinned core', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'Is allergic to peanuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const response = await Bun.fetch('http://localhost/memory/items/pin', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ itemID: item.itemID, isPinned: true }),
  });
  const [body, core] = await Promise.all([response.json(), ctx.memory.store.readPinnedCore()]);

  expect(body).toStrictEqual({ itemID: item.itemID, isPinned: true });
  expect(core.map((entry) => entry.itemID)).toStrictEqual([item.itemID]);
});

test('it unpins a memory item, which leaves the pinned core', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const item = await ctx.memory.store.remember({
    text: 'Is allergic to peanuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const response = await Bun.fetch('http://localhost/memory/items/pin', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ itemID: item.itemID, isPinned: false }),
  });
  const [body, core] = await Promise.all([response.json(), ctx.memory.store.readPinnedCore()]);

  expect(body).toStrictEqual({ itemID: item.itemID, isPinned: false });
  expect(core).toStrictEqual([]);
});

test('it answers 404 to a pin of a memory item that does not exist', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const response = await Bun.fetch('http://localhost/memory/items/pin', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({ itemID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f', isPinned: true }),
  });

  expect(response.status).toBe(404);
});

test('it approves a memory proposal with your edited text, as your own version', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jaz' });

  const response = await Bun.fetch('http://localhost/memory/proposals/approve', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({
      proposalID: proposal.proposalID,
      actionHash: proposal.actionHash,
      editedText: 'Likes jazz',
    }),
  });
  const [body, history] = await Promise.all([
    response.json(),
    ctx.memory.store.readHistory(proposal.itemID),
  ]);

  expect(body).toStrictEqual({ status: 'applied', itemID: proposal.itemID, version: 1 });
  expect(history?.versions).toMatchObject([
    { version: 1, change: 'created', origin: 'owner', source: 'owner', text: 'Likes jazz' },
  ]);
});

test('it answers 400 to a rejection that carries edited text, and rejects nothing', async () => {
  const ctx = await setupTest();
  const socket = await startControlSocket({
    path: ctx.path,
    createEnrolmentCode: () => Promise.reject(new Error('unused')),
    readMemory: () => ctx.memory.store,
    readSessions: () => Promise.reject(new Error('unused')),
    updateSessionLabel: () => Promise.reject(new Error('unused')),
  });

  onTestFinished(() => socket.stop());

  const proposal = await createProposal(ctx.memory.store, { text: 'Likes jazz' });

  const response = await Bun.fetch('http://localhost/memory/proposals/reject', {
    method: 'POST',
    unix: ctx.path,
    body: JSON.stringify({
      proposalID: proposal.proposalID,
      actionHash: proposal.actionHash,
      editedText: 'Likes blues',
    }),
  });
  const [reason, pending] = await Promise.all([
    response.text(),
    ctx.memory.store.proposals.listPending(),
  ]);

  expect(response.status).toBe(400);
  expect(reason).toBe('a rejection takes no edited text');
  expect(pending.map((entry) => entry.proposalID)).toStrictEqual([proposal.proposalID]);
});
