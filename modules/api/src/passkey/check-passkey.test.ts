import { expect, test } from 'bun:test';
import {
  buildActionSeeder,
  createTestStep,
  seedActionRiskClass,
} from '@heynixie/actions/test-utils';
import type { ContractInputs } from '@heynixie/contract';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import { buildActionProposalInput } from '@heynixie/policy';
import { createConversationTask } from '@heynixie/tasks';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { seedPasskey } from '../test-utils/seed-passkey';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';
import { alwaysAskKinds } from './always-ask-kinds';
import { findPasskeyWindow } from './find-passkey-window';
import { openPasskeyWindow } from './open-passkey-window';
import { createPasskeyState } from './passkey-state';
import { updatePasskeyRevoked } from './update-passkey-revoked';

interface ProposalRef {
  readonly proposalID: string;
  readonly actionHash: string;
}

type ChallengeFor = ContractInputs['passkeys']['challenge']['for'];

async function setupTest() {
  const origin = 'https://nixie.example.org';

  const api = await startTestAPI();

  // the writer stamps records with the wall clock, so the test clock starts there
  api.clock.advance(Date.now() - api.clock.now());

  await createConversationTask(api.context);

  const laptop = await createDeviceSession(api.context, 'laptop');
  const phone = await createDeviceSession(api.context, 'phone');

  const client = buildTestClient(api.url, laptop.token, origin);
  const phoneClient = buildTestClient(api.url, phone.token, origin);
  const seeder = buildActionSeeder({ context: api.context });

  const passkey = await seedPasskey(api.context, { caller: laptop.caller });

  let rowCount = 0;

  const createAlwaysAskUnknown = async () => {
    const step = await createTestStep(api.context);

    const action = await seeder.unknownAction({
      step,
      arguments: { to: 'team', text: 'Boat is ready' },
    });

    await seedActionRiskClass(api.writer, action.action_id, 'always_ask');

    return action.action_id;
  };

  const createAlwaysAskRow = async () => {
    rowCount += 1;

    const to = `chandlery-${rowCount}@example.org`;

    const proposed = buildActionProposalInput({
      definitions: api.context.definitions(),
      thread: 'conversation',
      callSequence: rowCount,
      tool: 'shop.buy',
      effects: ['spend'],
      cause: 'always_ask',
      input: { to },
      destinations: [{ value: to, replyTarget: false }],
    });

    await writeRecords(api.context.log, [proposed.record]);

    const listed = await client.approvals.listItems();

    const item = listed.items.find((entry) => entry.proposal.shortID === proposed.shortID);

    invariant(item, 'the seeded row is not listed');

    return { proposalID: proposed.shortID, actionHash: item.proposal.actionHash };
  };

  const assertFor = async (binding: ChallengeFor) => {
    const issued = await client.passkeys.challenge({ for: binding });

    return passkey.authenticator.assert(issued.options, { origin });
  };

  return {
    api,
    laptop,
    passkey,
    client,
    phoneClient,
    createAlwaysAskUnknown,
    createAlwaysAskRow,
    assertFor,
    readUsed: () => readRecords(api.context.log, { afterSequence: 0, kinds: ['passkey.used'] }),
    tap: async (actionID: string) => {
      await client.approvals.answerUnknownOutcome({
        actionID,
        choice: 'retry',
        clientActionID: crypto.randomUUID(),
        passkey: await assertFor({ kind: 'unknown_outcome', actionID, choice: 'retry' }),
      });
    },
    tapProposal: async (row: ProposalRef) =>
      client.approvals.answerProposal({
        ...row,
        choice: 'approve',
        clientActionID: crypto.randomUUID(),
        passkey: await assertFor({ kind: 'answer', ...row, choice: 'approve' }),
      }),
    retry: (target: typeof client, actionID: string) =>
      target.approvals.answerUnknownOutcome({
        actionID,
        choice: 'retry',
        clientActionID: crypto.randomUUID(),
      }),
  };
}

test('#checkPasskey passes a second check of the same session within 10 minutes with no assertion', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  ctx.api.clock.advance(9 * 60_000);

  const retried = await ctx.retry(ctx.client, second);

  expect(retried).toStrictEqual({ actionID: second, choice: 'retry' });
});

test('#checkPasskey approves an always-ask proposal with no assertion in an open window, and writes no passkey.used for it', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskRow();
  const second = await ctx.createAlwaysAskRow();

  await ctx.tapProposal(first);

  const answered = await ctx.client.approvals.answerProposal({
    ...second,
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  const used = await ctx.readUsed();

  expect([answered.state, used.length]).toStrictEqual(['approved', 1]);
});

test('#approvals.answerProposals approves a batch of always-ask proposals in an open window', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskRow();
  const second = await ctx.createAlwaysAskRow();

  await ctx.tapProposal(first);

  const answered = await ctx.client.approvals.answerProposals({
    answers: [{ ...second, choice: 'approve', clientActionID: crypto.randomUUID() }],
  });

  expect(answered).toStrictEqual({
    results: [{ proposalID: expect.any(String), state: 'approved' }],
  });
});

test('#approvals.answerProposals refuses an always-ask proposal in a batch when no window is open', async () => {
  const ctx = await setupTest();
  const row = await ctx.createAlwaysAskRow();

  const answered = await ctx.client.approvals.answerProposals({
    answers: [{ ...row, choice: 'approve', clientActionID: crypto.randomUUID() }],
  });

  expect(answered).toStrictEqual({
    results: [{ proposalID: row.proposalID, error: 'PASSKEY_REQUIRED' }],
  });
});

test.each([
  { elapsedMs: 9 * 60_000, outcome: 'fulfilled' },
  { elapsedMs: 10 * 60_000, outcome: 'rejected' },
])(
  '#checkPasskey settles a check of the same session as $outcome after $elapsedMs ms',
  async (row) => {
    const ctx = await setupTest();
    const first = await ctx.createAlwaysAskUnknown();
    const second = await ctx.createAlwaysAskUnknown();

    await ctx.tap(first);

    ctx.api.clock.advance(row.elapsedMs);

    const [settled] = await Promise.allSettled([ctx.retry(ctx.client, second)]);

    expect(settled?.status).toBe(row.outcome);
  },
);

test('#checkPasskey covers the session that tapped and asks another session', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();
  const third = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  const settled = await Promise.allSettled([
    ctx.retry(ctx.client, second),
    ctx.retry(ctx.phoneClient, third),
  ]);

  expect(
    settled.map((result) =>
      result.status === 'fulfilled'
        ? 'covered'
        : z.object({ code: z.string() }).parse(result.reason).code,
    ),
  ).toStrictEqual(['covered', 'PASSKEY_REQUIRED']);
});

test('#checkPasskey asks with no window open before any tap', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();
  const [settled] = await Promise.allSettled([ctx.retry(ctx.client, action)]);

  expect(settled).toMatchObject({ status: 'rejected', reason: { code: 'PASSKEY_REQUIRED' } });
});

test('#checkPasskey restarts the window with a second tap', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();
  const third = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  ctx.api.clock.advance(6 * 60_000);

  await ctx.tap(second);

  ctx.api.clock.advance(6 * 60_000);

  const retried = await ctx.retry(ctx.client, third);

  expect(retried).toStrictEqual({ actionID: third, choice: 'retry' });
});

test('#checkPasskey leaves the close time alone when the window covers a check', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();
  const third = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  ctx.api.clock.advance(6 * 60_000);

  await ctx.retry(ctx.client, second);

  ctx.api.clock.advance(4 * 60_000);

  const [settled] = await Promise.allSettled([ctx.retry(ctx.client, third)]);

  expect(settled).toMatchObject({ status: 'rejected', reason: { code: 'PASSKEY_REQUIRED' } });
});

test('#checkPasskey asks again once the passkey that opened the window is revoked', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();

  await seedPasskey(ctx.api.context, { caller: ctx.laptop.caller });

  await ctx.tap(first);

  await withWriteTransaction(ctx.api.context.log.writer, (tx) =>
    updatePasskeyRevoked(tx, ctx.api.context, {
      passkeyID: ctx.passkey.passkeyID,
      revokedBy: 'host',
    }),
  );

  const [settled] = await Promise.allSettled([ctx.retry(ctx.client, second)]);

  expect(settled).toMatchObject({ status: 'rejected', reason: { code: 'PASSKEY_REQUIRED' } });
});

test('#checkPasskey covers an answer and refuses adding and removing a passkey in the same window', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  const settled = await Promise.allSettled([
    ctx.retry(ctx.client, second),
    ctx.client.passkeys.registrationOptions({}),
    ctx.client.passkeys.revoke({
      clientActionID: crypto.randomUUID(),
      passkeyID: ctx.passkey.passkeyID,
    }),
  ]);

  expect(
    settled.map((result) =>
      result.status === 'fulfilled'
        ? 'covered'
        : z.object({ code: z.string() }).parse(result.reason).code,
    ),
  ).toStrictEqual(['covered', 'CODE_REQUIRED', 'PASSKEY_REQUIRED']);
});

test('#openPasskeyWindow keeps the window length the settings give', () => {
  const clock = createFakeClock();
  const passkeys = createPasskeyState();
  const context = { clock, passkeys, settings: { ...defaultAPISettings, passkeyWindowMs: 60_000 } };
  const binding = { kind: 'unknown_outcome', actionID: 'a1', choice: 'retry' } as const;
  const query = { identityID: 'session-1', binding, livePasskeyIDs: ['p1'] };

  openPasskeyWindow(context, { identityID: 'session-1', passkeyID: 'p1' });

  clock.advance(59_000);

  const inside = findPasskeyWindow(context, query);

  clock.advance(1000);

  const outside = findPasskeyWindow(context, query);

  expect([inside, outside]).toStrictEqual(['p1', null]);
});

test.each([
  { binding: { kind: 'unknown_outcome', actionID: 'a1', choice: 'retry' }, covered: 'p1' },
  {
    binding: { kind: 'answer', proposalID: 'x1', actionHash: 'h1', choice: 'approve' },
    covered: 'p1',
  },
  { binding: { kind: 'register' }, covered: null },
  { binding: { kind: 'revoke', passkeyID: 'p1' }, covered: null },
] as const)('#findPasskeyWindow covers a $binding.kind check as $covered', (row) => {
  const passkeys = createPasskeyState();
  const context = { clock: createFakeClock(), passkeys };

  passkeys.windows.set('session-1', { passkeyID: 'p1', closesAtMs: context.clock.now() + 1000 });

  const found = findPasskeyWindow(context, {
    identityID: 'session-1',
    binding: row.binding,
    livePasskeyIDs: ['p1'],
  });

  expect(found).toBe(row.covered);
});

test('#findPasskeyWindow covers nothing for a window whose passkey is no longer live', () => {
  const passkeys = createPasskeyState();
  const context = { clock: createFakeClock(), passkeys };

  passkeys.windows.set('session-1', { passkeyID: 'p1', closesAtMs: context.clock.now() + 1000 });

  const found = findPasskeyWindow(context, {
    identityID: 'session-1',
    binding: { kind: 'unknown_outcome', actionID: 'a1', choice: 'retry' },
    livePasskeyIDs: ['p2'],
  });

  expect(found).toBeNull();
});

test('#defaultAPISettings gives the window a default of 10 minutes', () => {
  expect(defaultAPISettings.passkeyWindowMs).toBe(10 * 60_000);
});

test('#alwaysAskKinds lists adding and removing a passkey and nothing else', () => {
  expect([...alwaysAskKinds]).toStrictEqual(['register', 'revoke']);
});

test('#passkeys.window reports an open window for an answer and never for adding or removing a passkey', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  await ctx.tap(action);

  const asks = [
    { kind: 'unknown_outcome' as const, actionID: 'a1', choice: 'retry' as const },
    { kind: 'register' as const },
    { kind: 'revoke' as const, passkeyID: 'p1' },
  ];

  const reports = await Promise.all(
    asks.map((binding) => ctx.client.passkeys.window({ for: binding })),
  );

  expect(reports).toStrictEqual([{ isOpen: true }, { isOpen: false }, { isOpen: false }]);
});

test('#passkeys.revoke refuses a revoke that carries no assertion for it, even in an open window', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  await ctx.tap(action);

  const other = await createDeviceSession(ctx.api.context, 'tablet');
  const spare = await seedPasskey(ctx.api.context, { caller: other.caller });

  const issued = await ctx.client.passkeys.challenge({
    for: { kind: 'unknown_outcome', actionID: action, choice: 'retry' },
  });

  const revocation = ctx.client.passkeys.revoke({
    clientActionID: crypto.randomUUID(),
    passkeyID: spare.passkeyID,
    passkey: await spare.authenticator.assert(issued.options, {
      origin: 'https://nixie.example.org',
    }),
  });

  expect(revocation).rejects.toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'binding' } });
});

test('#checkPasskey refuses an assertion issued for another action even in an open window', async () => {
  const ctx = await setupTest();
  const first = await ctx.createAlwaysAskUnknown();
  const second = await ctx.createAlwaysAskUnknown();

  await ctx.tap(first);

  const retry = ctx.client.approvals.answerUnknownOutcome({
    actionID: second,
    choice: 'retry',
    clientActionID: crypto.randomUUID(),
    passkey: await ctx.assertFor({ kind: 'unknown_outcome', actionID: first, choice: 'retry' }),
  });

  expect(retry).rejects.toMatchObject({ code: 'PASSKEY_FAILED', data: { reason: 'binding' } });
});

test('#sessions.signOut ends the window of the session', async () => {
  const ctx = await setupTest();
  const action = await ctx.createAlwaysAskUnknown();

  const query = {
    identityID: ctx.laptop.sessionID,
    binding: { kind: 'unknown_outcome', actionID: 'a1', choice: 'retry' },
    livePasskeyIDs: [ctx.passkey.passkeyID],
  } as const;

  await ctx.tap(action);

  const before = findPasskeyWindow(ctx.api.context, query);

  await ctx.client.sessions.signOut({});

  const after = findPasskeyWindow(ctx.api.context, query);

  expect([before, after]).toStrictEqual([ctx.passkey.passkeyID, null]);
});
