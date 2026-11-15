import { expect, test } from 'bun:test';
import type { ContractInputs } from '@heynixie/contract';
import type { RecordInput } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import { buildActionProposalInput } from '@heynixie/policy';
import type { ProposalKindHandler } from '@heynixie/proposals';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { runApprovalAnswer } from '../approval/run-approval-answer';
import { buildProposalCoreDeps } from '../proposal/build-proposal-core-deps';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import type { AuthenticatorFlags } from '../test-utils/create-test-authenticator';
import { createTestAuthenticator } from '../test-utils/create-test-authenticator';
import type { SeededPasskey } from '../test-utils/seed-passkey';
import { seedPasskey } from '../test-utils/seed-passkey';
import { startTestAPI } from '../test-utils/start-test-api';
import type { APITables } from '../types';
import { createPasskeyAnswerGate } from './create-passkey-answer-gate';
import { createPasskeyCheck } from './create-passkey-check';

type Assertion = NonNullable<ContractInputs['approvals']['answerProposal']['passkey']>;

interface AnswerTarget {
  readonly proposalID: string;
  readonly actionHash: string;
  readonly choice: 'approve' | 'always_allow' | 'defer' | 'decline';
}

interface AnswerInput extends AnswerTarget {
  readonly passkey?: Assertion;
  readonly clientActionID?: string;
}

async function setupTest() {
  const origin = 'https://nixie.example.org';

  const api = await startTestAPI();

  // the writer stamps records with the wall clock, so the test clock starts there
  api.clock.advance(Date.now() - api.clock.now());

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token, origin);

  const buildRow = (to: string, cause: 'always_ask' | 'no_rule', riskClass?: 'lifting') => {
    const proposed = buildActionProposalInput({
      definitions: api.context.definitions(),
      thread: 'conversation',
      callSequence: 1,
      tool: 'shop.buy',
      effects: ['spend'],
      cause,
      input: { to },
      destinations: [{ value: to, replyTarget: false }],
    });

    const record: RecordInput =
      riskClass === undefined
        ? proposed.record
        : { ...proposed.record, payload: { ...proposed.record.payload, riskClass } };

    return { shortID: proposed.shortID, record };
  };

  const writeRow = async (row: ReturnType<typeof buildRow>) => {
    await writeRecords(api.context.log, [row.record]);

    const listed = await client.approvals.listItems();

    const item = listed.items
      .filter((entry) => entry.group !== 'unknown_outcome')
      .find((entry) => entry.proposal.shortID === row.shortID);

    invariant(item, 'the seeded row is not listed');

    return {
      proposalID: row.shortID,
      actionHash: item.proposal.actionHash,
      passkeyChoices: item.passkeyChoices,
    };
  };

  // a kind that owns its transaction applies the answer in its own, with the guard inside it
  const real = buildProposalCoreDeps(api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  const action = real.handlers.get('action');

  invariant(action, 'the server wires an action handler');

  const owning: ProposalKindHandler = {
    ...action,
    ownsTransaction: true,
    approve: (run, row) =>
      withWriteTransaction(api.context.log.writer, async (tx) => {
        await run.guard(tx);

        return { status: 'done', result: { proposalID: row.id, state: 'approved' } };
      }),
  };

  return {
    api,
    laptop,
    client,
    origin,
    ownedDeps: { ...real, handlers: new Map([['action' as const, owning]]) },
    refusalOf: async (call: Promise<unknown>) => {
      try {
        return await call;
      } catch (error) {
        return error;
      }
    },
    createAlwaysAskRow: () => writeRow(buildRow('chandlery@example.org', 'always_ask')),
    createLiftingRow: () => writeRow(buildRow('chandlery@example.org', 'always_ask', 'lifting')),
    createRoutineRow: () => writeRow(buildRow('harbour@example.org', 'no_rule')),
    readKinds: (kinds: readonly ('passkey.used' | 'policy.action_answered')[]) =>
      readRecords(api.context.log, { afterSequence: 0, kinds: [...kinds] }),
    assertionFor: async (
      seeded: SeededPasskey,
      answer: AnswerTarget,
      flags: AuthenticatorFlags = {},
    ) => {
      const optionsIssued = await client.passkeys.challenge({ for: { kind: 'answer', ...answer } });

      const options = optionsIssued.options;

      return seeded.authenticator.assert(options, { origin, ...flags });
    },
    answer: (input: AnswerInput) =>
      client.approvals.answerProposal({
        proposalID: input.proposalID,
        actionHash: input.actionHash,
        choice: input.choice,
        clientActionID: input.clientActionID ?? crypto.randomUUID(),
        ...(input.choice === 'defer'
          ? { deferUntil: new Date(api.clock.now() + 2 * 60 * 60 * 1000) }
          : {}),
        ...(input.passkey === undefined ? {} : { passkey: input.passkey }),
      }),
  };
}

test('#approvals.listItems lists the choices that take a passkey on an always-ask row, and none on a routine row', async () => {
  const ctx = await setupTest();
  const alwaysAsk = await ctx.createAlwaysAskRow();
  const routine = await ctx.createRoutineRow();

  expect([alwaysAsk.passkeyChoices, routine.passkeyChoices]).toStrictEqual([['approve'], []]);
});

test('#approvals.answerProposal refuses an approval of an always-ask row with no assertion as PASSKEY_REQUIRED', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const row = await ctx.createAlwaysAskRow();
  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve' }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_REQUIRED' });
});

test('#approvals.answerProposal refuses an approval of a lifting row with no assertion as PASSKEY_REQUIRED', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const row = await ctx.createLiftingRow();
  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve' }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_REQUIRED' });
});

test('#approvals.answerProposal refuses an approval of an always-ask row as NO_PASSKEY when no passkey is live', async () => {
  const ctx = await setupTest();
  const row = await ctx.createAlwaysAskRow();
  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve' }));

  expect(refusal).toMatchObject({ code: 'NO_PASSKEY' });
});

test('#approvals.answerProposal approves an always-ask row on a passkey assertion and records the use', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();
  const passkey = await ctx.assertionFor(seeded, { ...row, choice: 'approve' });
  const result = await ctx.answer({ ...row, choice: 'approve', passkey });
  const used = await ctx.readKinds(['passkey.used']);

  expect([result.state, used.map((read) => read.record.payload)]).toStrictEqual([
    'approved',
    [
      {
        passkeyID: seeded.passkeyID,
        binding: {
          kind: 'answer',
          proposalID: row.proposalID,
          actionHash: row.actionHash,
          choice: 'approve',
          ruleHash: null,
        },
      },
    ],
  ]);
});

test('#approvals.answerProposal approves a lifting row on a passkey assertion', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createLiftingRow();
  const passkey = await ctx.assertionFor(seeded, { ...row, choice: 'approve' });
  const result = await ctx.answer({ ...row, choice: 'approve', passkey });

  expect(result.state).toBe('approved');
});

test.each(['defer', 'decline'] as const)(
  '#approvals.answerProposal takes %s on an always-ask row with no passkey',
  async (choice) => {
    const ctx = await setupTest();
    const row = await ctx.createAlwaysAskRow();
    const result = await ctx.answer({ ...row, choice });

    const expected = choice === 'defer' ? 'deferred' : 'declined';

    expect(result.state).toBe(expected);
  },
);

test('#approvals.answerProposal refuses always allow on an always-ask row at the choice check, before the passkey check', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const row = await ctx.createAlwaysAskRow();
  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'always_allow' }));

  expect(refusal).toMatchObject({ code: 'NOT_ALLOWED', data: { reason: 'choice' } });
});

test('#approvals.answerProposal approves a routine row with no passkey', async () => {
  const ctx = await setupTest();
  const row = await ctx.createRoutineRow();
  const result = await ctx.answer({ ...row, choice: 'approve' });

  expect(result.state).toBe('approved');
});

test('#approvals.answerProposal fails an assertion that works once with unknown_challenge the second time', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const first = await ctx.createAlwaysAskRow();
  const second = await ctx.createAlwaysAskRow();
  const passkey = await ctx.assertionFor(seeded, { ...first, choice: 'approve' });

  await ctx.answer({ ...first, choice: 'approve', passkey });

  const refusal = await ctx.refusalOf(ctx.answer({ ...second, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({
    code: 'PASSKEY_FAILED',
    data: { reason: 'unknown_challenge' },
  });
});

test('#approvals.answerProposal fails an assertion after its challenge lapses at 5 minutes', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();
  const passkey = await ctx.assertionFor(seeded, { ...row, choice: 'approve' });

  ctx.api.clock.advance(5 * 60 * 1000);

  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'unknown_challenge' } });
});

test('#approvals.answerProposal fails an assertion that was issued for another proposal with binding', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const asked = await ctx.createAlwaysAskRow();
  const other = await ctx.createAlwaysAskRow();
  const passkey = await ctx.assertionFor(seeded, { ...asked, choice: 'approve' });
  const refusal = await ctx.refusalOf(ctx.answer({ ...other, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'binding' } });
});

test('#approvals.answerProposal fails an assertion that was issued for another action hash with binding', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const passkey = await ctx.assertionFor(seeded, {
    ...row,
    actionHash: 'sha256:another',
    choice: 'approve',
  });

  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'binding' } });
});

test('#approvals.answerProposal fails an assertion that was issued for another choice with binding', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();
  const passkey = await ctx.assertionFor(seeded, { ...row, choice: 'decline' });
  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'binding' } });
});

// Only a routine row offers Always allow, and a routine row takes no passkey, so no answer reaches
// the check with a rule hash, and the test calls the check itself.
test('#createPasskeyCheck fails an assertion that was issued for another rule hash with binding', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const asked = { ...row, choice: 'always_allow' as const, ruleHash: 'sha256:rule-harbour' };

  const optionsIssued = await ctx.client.passkeys.challenge({ for: { kind: 'answer', ...asked } });

  const assertion = await seeded.authenticator.assert(optionsIssued.options, {
    origin: ctx.origin,
  });

  const verdict = await withWriteTransaction(ctx.api.context.log.writer, (tx) =>
    createPasskeyCheck(ctx.api.context).verify(
      tx,
      ctx.laptop.caller,
      {
        kind: 'answer',
        proposalID: row.proposalID,
        actionHash: row.actionHash,
        choice: 'always_allow',
        ruleHash: 'sha256:rule-marina',
      },
      assertion,
    ),
  );

  expect(verdict).toStrictEqual({ error: 'PASSKEY_FAILED', reason: 'binding' });
});

test('#approvals.answerProposal fails an assertion that another session asked for with unknown_challenge', async () => {
  const ctx = await setupTest();
  const tablet = await createDeviceSession(ctx.api.context, 'tablet');
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const tabletClient = buildTestClient(ctx.api.url, tablet.token, ctx.origin);

  const optionsIssued = await tabletClient.passkeys.challenge({
    for: { kind: 'answer', ...row, choice: 'approve' },
  });

  const options = optionsIssued.options;

  const passkey = await seeded.authenticator.assert(options, { origin: ctx.origin });
  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'unknown_challenge' } });
});

test('#approvals.answerProposal fails an assertion with no user verification', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const passkey = await ctx.assertionFor(
    seeded,
    { ...row, choice: 'approve' },
    { isUserVerified: false },
  );

  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({
    code: 'PASSKEY_FAILED',
    data: { reason: 'no_user_verification' },
  });
});

test('#approvals.answerProposal fails an assertion from another origin', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const passkey = await ctx.assertionFor(
    seeded,
    { ...row, choice: 'approve' },
    { origin: 'https://phishing.example.net' },
  );

  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'origin' } });
});

test('#approvals.answerProposal fails an assertion that a different key signed', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();
  const forger = await createTestAuthenticator();

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'answer', ...row, choice: 'approve' },
  });

  const options = optionsIssued.options;

  const forged = await forger.assert(options, { origin: ctx.origin });

  const passkey = {
    ...forged,
    id: seeded.authenticator.credentialID,
    rawId: seeded.authenticator.credentialID,
  };

  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'signature' } });
});

test('#approvals.answerProposal fails an assertion whose counter is nonzero and does not grow', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const first = await ctx.createAlwaysAskRow();
  const second = await ctx.createAlwaysAskRow();

  const assert = ctx.assertionFor;

  await ctx.answer({
    ...first,
    choice: 'approve',
    passkey: await assert(seeded, { ...first, choice: 'approve' }, { counter: 5 }),
  });

  const refusal = await ctx.refusalOf(
    ctx.answer({
      ...second,
      choice: 'approve',
      passkey: await assert(seeded, { ...second, choice: 'approve' }, { counter: 5 }),
    }),
  );

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'counter' } });
});

test('#approvals.answerProposal fails an assertion whose counter falls back to zero after it counted', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const first = await ctx.createAlwaysAskRow();
  const second = await ctx.createAlwaysAskRow();

  const assert = ctx.assertionFor;

  await ctx.answer({
    ...first,
    choice: 'approve',
    passkey: await assert(seeded, { ...first, choice: 'approve' }, { counter: 3 }),
  });

  const refusal = await ctx.refusalOf(
    ctx.answer({
      ...second,
      choice: 'approve',
      passkey: await assert(seeded, { ...second, choice: 'approve' }, { counter: 0 }),
    }),
  );

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'counter' } });
});

test('#approvals.answerProposal accepts two assertions that both report a counter of zero', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const first = await ctx.createAlwaysAskRow();
  const second = await ctx.createAlwaysAskRow();

  const assert = ctx.assertionFor;

  await ctx.answer({
    ...first,
    choice: 'approve',
    passkey: await assert(seeded, { ...first, choice: 'approve' }),
  });

  const result = await ctx.answer({
    ...second,
    choice: 'approve',
    passkey: await assert(seeded, { ...second, choice: 'approve' }),
  });

  expect(result.state).toBe('approved');
});

test('#approvals.answerProposal stores nothing under the client action ID of a refused check, so a retry with a fresh assertion passes', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const clientActionID = crypto.randomUUID();

  const refused = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', clientActionID }));
  const passkey = await ctx.assertionFor(seeded, { ...row, choice: 'approve' });
  const retried = await ctx.answer({ ...row, choice: 'approve', clientActionID, passkey });

  expect([refused, retried.state]).toStrictEqual([
    expect.objectContaining({ code: 'PASSKEY_REQUIRED' }),
    'approved',
  ]);
});

test('#approvals.answerProposal refuses an answer with the passkey of a revoke that committed first', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const second = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();
  const passkey = await ctx.assertionFor(first, { ...row, choice: 'approve' });

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: first.passkeyID },
  });

  const options = optionsIssued.options;

  await ctx.client.passkeys.revoke({
    clientActionID: crypto.randomUUID(),
    passkeyID: first.passkeyID,
    passkey: await second.authenticator.assert(options, { origin: ctx.origin }),
  });

  const refusal = await ctx.refusalOf(ctx.answer({ ...row, choice: 'approve', passkey }));

  expect(refusal).toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'unknown_passkey' } });
});

test('#approvals.answerProposal leaves a waiting approval pending after the revoke of a passkey', async () => {
  const ctx = await setupTest();
  const first = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const second = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const optionsIssued = await ctx.client.passkeys.challenge({
    for: { kind: 'revoke', passkeyID: first.passkeyID },
  });

  const options = optionsIssued.options;

  await ctx.client.passkeys.revoke({
    clientActionID: crypto.randomUUID(),
    passkeyID: first.passkeyID,
    passkey: await second.authenticator.assert(options, { origin: ctx.origin }),
  });

  const passkey = await ctx.assertionFor(second, { ...row, choice: 'approve' });
  const listed = await ctx.client.approvals.listItems();
  const result = await ctx.answer({ ...row, choice: 'approve', passkey });

  expect([
    listed.items
      .filter((entry) => entry.group !== 'unknown_outcome')
      .map((item) => item.proposal.state),
    result.state,
  ]).toStrictEqual([['pending'], 'approved']);
});

test('#approvals.answerProposals refuses each answer that takes a passkey as PASSKEY_REQUIRED, with or without a live passkey', async () => {
  const ctx = await setupTest();
  const row = await ctx.createAlwaysAskRow();

  const refusedWithNone = await ctx.client.approvals.answerProposals({
    answers: [{ ...row, choice: 'approve', clientActionID: crypto.randomUUID() }],
  });

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const refusedWithOne = await ctx.client.approvals.answerProposals({
    answers: [{ ...row, choice: 'approve', clientActionID: crypto.randomUUID() }],
  });

  expect([refusedWithNone, refusedWithOne]).toStrictEqual([
    { results: [{ proposalID: row.proposalID, error: 'PASSKEY_REQUIRED' }] },
    { results: [{ proposalID: row.proposalID, error: 'PASSKEY_REQUIRED' }] },
  ]);
});

test('#approvals.answerProposals approves a routine row with no passkey', async () => {
  const ctx = await setupTest();
  const row = await ctx.createRoutineRow();

  const answered = await ctx.client.approvals.answerProposals({
    answers: [{ ...row, choice: 'approve', clientActionID: crypto.randomUUID() }],
  });

  expect(answered).toStrictEqual({
    results: [{ proposalID: expect.any(String), state: 'approved' }],
  });
});

test('#runApprovalAnswer refuses a gated choice when the caller names no passkey gate', async () => {
  const ctx = await setupTest();
  const row = await ctx.createAlwaysAskRow();

  const deps = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  const run = await runApprovalAnswer(ctx.api.context, deps, ctx.laptop.caller, {
    answer: { ...row, choice: 'approve', clientActionID: crypto.randomUUID() },
    passkey: undefined,
  });

  expect(run).toStrictEqual({ status: 'passkey_refused', refusal: { error: 'PASSKEY_REQUIRED' } });
});

test('#runApprovalAnswer lets a host answer through with no passkey and writes no passkey.used', async () => {
  const ctx = await setupTest();
  const row = await ctx.createAlwaysAskRow();

  const deps = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  const run = await runApprovalAnswer(ctx.api.context, deps, ctx.laptop.caller, {
    answer: { ...row, choice: 'approve', clientActionID: crypto.randomUUID() },
    passkey: { kind: 'host' },
  });

  const used = await ctx.readKinds(['passkey.used']);

  expect([run.status, used]).toStrictEqual(['settled', []]);
});

test('#runApprovalAnswer rolls back the passkey use and the counter with a handler that fails', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();

  const real = buildProposalCoreDeps(ctx.api.context, {
    readMemory: () => null,
    runInForceSeed: () => Promise.resolve(),
  });

  const action = real.handlers.get('action');

  invariant(action, 'the server wires an action handler');

  const failing: ProposalKindHandler = {
    ...action,
    approve: () => Promise.reject(new Error('the tool endpoint is gone')),
  };

  const deps = { ...real, handlers: new Map([['action' as const, failing]]) };

  const assertion = await ctx.assertionFor(seeded, { ...row, choice: 'approve' }, { counter: 9 });

  const call = runApprovalAnswer(ctx.api.context, deps, ctx.laptop.caller, {
    answer: { ...row, choice: 'approve', clientActionID: crypto.randomUUID(), passkey: assertion },
    passkey: createPasskeyAnswerGate(ctx.api.context, {
      caller: ctx.laptop.caller,
      assertion,
    }),
  });

  const failure = await ctx.refusalOf(call);

  const stored = await ctx.api.writer.db
    .$extendTables<APITables>()
    .selectFrom('passkeys')
    .select('sign_count')
    .execute();

  const used = await ctx.readKinds(['passkey.used']);

  expect([failure, stored, used]).toStrictEqual([
    expect.objectContaining({ message: 'the tool endpoint is gone' }),
    [{ sign_count: 0 }],
    [],
  ]);
});

test('#runApprovalAnswer checks the passkey inside the guard of a kind that owns its transaction', async () => {
  const ctx = await setupTest();
  const seeded = await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });
  const row = await ctx.createAlwaysAskRow();
  const assertion = await ctx.assertionFor(seeded, { ...row, choice: 'approve' });

  const run = await runApprovalAnswer(ctx.api.context, ctx.ownedDeps, ctx.laptop.caller, {
    answer: { ...row, choice: 'approve', clientActionID: crypto.randomUUID(), passkey: assertion },
    passkey: createPasskeyAnswerGate(ctx.api.context, { caller: ctx.laptop.caller, assertion }),
  });

  const used = await ctx.readKinds(['passkey.used']);

  expect([run.status, used.length]).toStrictEqual(['settled', 1]);
});

test('#runApprovalAnswer refuses a kind that owns its transaction with no assertion, and stores no settlement', async () => {
  const ctx = await setupTest();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  const row = await ctx.createAlwaysAskRow();

  const clientActionID = crypto.randomUUID();

  const run = await runApprovalAnswer(ctx.api.context, ctx.ownedDeps, ctx.laptop.caller, {
    answer: { ...row, choice: 'approve', clientActionID },
    passkey: createPasskeyAnswerGate(ctx.api.context, {
      caller: ctx.laptop.caller,
      assertion: undefined,
    }),
  });

  const stored = await ctx.api.writer.db
    .$extendTables<APITables>()
    .selectFrom('client_actions')
    .select('client_action_id')
    .where('client_action_id', '=', clientActionID)
    .execute();

  expect([run, stored]).toStrictEqual([
    { status: 'passkey_refused', refusal: { error: 'PASSKEY_REQUIRED' } },
    [],
  ]);
});
