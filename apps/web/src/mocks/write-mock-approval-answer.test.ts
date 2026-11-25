import { expect, test } from 'bun:test';
import { store } from './store';
import type { MockApprovalAnswer } from './write-mock-approval-answer';
import { writeMockApprovalAnswer } from './write-mock-approval-answer';

async function setupTest() {
  const session = await store.sessions.create({});

  return {
    sessionID: session.sessionID,
    buildAnswer: (row: Pick<MockApprovalAnswer, 'proposalID' | 'actionHash'>) => ({
      proposalID: row.proposalID,
      actionHash: row.actionHash,
      clientActionID: crypto.randomUUID(),
    }),
  };
}

test('it approves an open row and records the session that answered', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({});

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'approve' },
    ctx.sessionID,
  );

  const stored = store.approvalRows.findFirst((query) =>
    query.where({ proposalID: row.proposalID }),
  );

  expect({ outcome, state: stored?.state, answeredBy: stored?.answeredBy }).toStrictEqual({
    outcome: { status: 'answered', result: { proposalID: row.proposalID, state: 'approved' } },
    state: 'approved',
    answeredBy: ctx.sessionID,
  });
});

test('it refuses a stale action hash with the current hashes and keeps the row open', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({});

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), actionHash: 'stale', choice: 'approve' },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'CONFLICT', current: { actionHash: row.actionHash, ruleHash: null } },
  });
});

test('it refuses an answer to a closed row', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({ state: 'declined' });

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'approve' },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'CLOSED', state: 'declined' },
  });
});

test('it refuses a choice the row does not offer', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({});

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'always_allow', ruleHash: 'rule' },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'choice' },
  });
});

test('it refuses an answer to an unknown row', async () => {
  const ctx = await setupTest();

  const outcome = await writeMockApprovalAnswer(
    {
      proposalID: 'missing',
      actionHash: 'x',
      clientActionID: crypto.randomUUID(),
      choice: 'approve',
    },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { error: 'NOT_ALLOWED', reason: 'not_found' },
  });
});

test('it moves a deferred row to deferred with its return time', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({});

  const deferUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'defer', deferUntil },
    ctx.sessionID,
  );

  const stored = store.approvalRows.findFirst((query) =>
    query.where({ proposalID: row.proposalID }),
  );

  expect([stored?.state, stored?.deferUntil]).toStrictEqual(['deferred', deferUntil]);
});

test('it adds the rule of an always allow and returns it', async () => {
  const ctx = await setupTest();

  const row = await store.approvalRows.create({
    choices: ['approve', 'always_allow', 'defer', 'decline'],
    rule: { ruleID: 'allow-harbour-mail', destinations: ['harbour@example.org'] },
    ruleHash: 'rule-hash',
    ruleSentence: 'Allow mail.send to harbour@example.org.',
  });

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'always_allow', ruleHash: 'rule-hash' },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({
    status: 'answered',
    result: {
      proposalID: row.proposalID,
      state: 'approved',
      rule: { id: 'allow-harbour-mail', revision: 1 },
    },
  });
});

test('it answers a memory write with a close match before it applies anything', async () => {
  const ctx = await setupTest();

  const row = await store.approvalRows.create({
    closeMatch: { itemID: 'item-1', text: 'Keeps bees on the roof', version: 2 },
    kind: 'memory_write',
  });

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'approve' },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({
    status: 'answered',
    result: {
      proposalID: row.proposalID,
      state: 'pending',
      closeMatch: { itemID: 'item-1', text: 'Keeps bees on the roof', version: 2 },
    },
  });
});

test('it applies the edited text of an approved memory write', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({ kind: 'memory_write', sentence: 'Keeps bes' });

  await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'approve', memory: { editedText: 'Keeps bees' } },
    ctx.sessionID,
  );

  const stored = store.approvalRows.findFirst((query) =>
    query.where({ proposalID: row.proposalID }),
  );

  expect(stored?.appliedText).toBe('Keeps bees');
});

test('it refuses the approval of an always-ask row with NO_PASSKEY when no passkey is live', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({ riskClass: 'always_ask' });

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'approve' },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({ status: 'passkey_refused', refusal: 'NO_PASSKEY' });
});

test('it refuses the approval of an always-ask row with no assertion as PASSKEY_REQUIRED', async () => {
  const ctx = await setupTest();

  await store.passkeyRows.create({});

  const row = await store.approvalRows.create({ riskClass: 'always_ask' });

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'approve' },
    ctx.sessionID,
  );

  expect(outcome).toStrictEqual({ status: 'passkey_refused', refusal: 'PASSKEY_REQUIRED' });
});

test('it keeps the assertion that approves an always-ask row', async () => {
  const ctx = await setupTest();
  const passkey = await store.passkeyRows.create({ credentialID: 'cred-1' });
  const row = await store.approvalRows.create({ riskClass: 'always_ask' });

  const clientData = Buffer.from(JSON.stringify({ challenge: 'chal-1' })).toString('base64url');

  const outcome = await writeMockApprovalAnswer(
    {
      ...ctx.buildAnswer(row),
      choice: 'approve',
      passkey: {
        id: passkey.credentialID,
        rawId: passkey.credentialID,
        type: 'public-key',
        clientExtensionResults: {},
        response: { clientDataJSON: clientData, authenticatorData: 'ad', signature: 'sig' },
      },
    },
    ctx.sessionID,
  );

  expect([outcome.status, store.passkeyChecks.all()]).toStrictEqual([
    'answered',
    [
      expect.objectContaining({
        challenge: 'chal-1',
        choice: 'approve',
        credentialID: 'cred-1',
        proposalID: row.proposalID,
      }),
    ],
  ]);
});

test('it takes the approval of an always-ask row with no assertion once an earlier answer tapped', async () => {
  const ctx = await setupTest();
  const passkey = await store.passkeyRows.create({ credentialID: 'cred-1' });
  const tapped = await store.approvalRows.create({ riskClass: 'always_ask' });
  const covered = await store.approvalRows.create({ riskClass: 'always_ask' });

  const clientData = Buffer.from(JSON.stringify({ challenge: 'chal-1' })).toString('base64url');

  await writeMockApprovalAnswer(
    {
      ...ctx.buildAnswer(tapped),
      choice: 'approve',
      passkey: {
        id: passkey.credentialID,
        rawId: passkey.credentialID,
        type: 'public-key',
        clientExtensionResults: {},
        response: { clientDataJSON: clientData, authenticatorData: 'ad', signature: 'sig' },
      },
    },
    ctx.sessionID,
  );

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(covered), choice: 'approve' },
    ctx.sessionID,
  );

  expect(outcome.status).toBe('answered');
});

test('it takes a decline of an always-ask row with no passkey', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({ riskClass: 'always_ask' });

  const outcome = await writeMockApprovalAnswer(
    { ...ctx.buildAnswer(row), choice: 'decline' },
    ctx.sessionID,
  );

  expect(outcome.status).toBe('answered');
});
