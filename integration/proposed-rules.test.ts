import { expect, test } from 'bun:test';
import { startTestRules } from '@heynixie/api/test-utils';
import { runGapChecks } from '@heynixie/definitions';
import {
  answerProposal,
  readOpenProposals,
  readProposal,
  runProposalLapses,
} from '@heynixie/proposals';
import invariant from 'tiny-invariant';

async function setupTest() {
  const rules = await startTestRules();

  const dayMs = 24 * 60 * 60 * 1000;
  const settings = { approvals: 3, windowDays: 30, quietDays: 30 };

  const readProposedRules = async () => {
    const open = await readOpenProposals(rules.log.writer.db, rules.clock.now());

    const rows = open.filter((row) => row.family === 'proposed_rule');
    const handler = rules.deps.handlers.get('proposed_rule');

    invariant(handler, 'the server wires a proposed rule handler');

    const bodies = await handler.readBodies(rules.log.writer.db, rows);

    return rows.map((row) => ({ row, body: bodies.get(row.id) ?? null }));
  };

  const approveSend = async (to = 'sam@example.org', body = 'The report is attached.') => {
    const proposalID = await rules.ask({ to, body });

    await rules.answer(proposalID, 'approve');

    rules.clock.advance(dayMs);
  };

  // an approval whose check never ran, as after a crash between the answer and its check
  const approveWithoutCheck = async (to: string) => {
    const action = rules.deps.handlers.get('action');

    invariant(action, 'the server wires an action handler');

    const crashing = {
      ...rules.deps,
      handlers: new Map([
        ...rules.deps.handlers,
        [
          'action' as const,
          {
            ...action,
            approve: async (...args: Parameters<typeof action.approve>) => {
              const applied = await action.approve(...args);

              return applied.status === 'done'
                ? { status: 'done' as const, result: applied.result }
                : applied;
            },
          },
        ],
      ]),
    };

    const proposalID = await rules.ask({ to });
    const row = await readProposal(rules.log.writer.db, proposalID);

    invariant(row, 'the ask opened a proposal');

    await answerProposal(
      crashing,
      { proposalID, actionHash: row.actionHash, choice: 'approve', identityID: 'identity-1' },
      { passkey: { kind: 'host' } },
    );

    return proposalID;
  };

  return {
    ...rules,
    dayMs,
    readProposedRules,
    approveSend,
    approveWithoutCheck,
    runStartChecks: () => runGapChecks(rules.context, settings),
    runLapses: () => runProposalLapses(rules.deps),
  };
}

test('it proposes one rule that covers the 3 approved calls, with checks on scalar arguments only', async () => {
  const ctx = await setupTest();

  await ctx.approveSend('sam@example.org', 'The report is attached.');
  await ctx.approveSend('sam@example.org', 'The numbers changed.');
  await ctx.approveSend('sam@example.org', 'Thanks for the note.');

  const [proposed] = await ctx.readProposedRules();

  expect(proposed?.body).toStrictEqual({
    sentence: expect.stringContaining('**Allow** `test.send`'),
    fields: { covers: '3 approvals: 2 Nov, 3 Nov, 4 Nov', group: 'test.send to sam@example.org' },
    ruleSentence: null,
    approveLabel: 'Allow this rule',
    rule: {
      outcome: 'allow',
      tools: ['test.send'],
      contexts: ['conversation'],
      checks: [
        { arg: 'account', op: 'eq', value: 'work' },
        { arg: 'to', op: 'eq', value: 'sam@example.org' },
      ],
      destinations: ['sam@example.org'],
      sources: ['owner'],
    },
  });
});

test('it gives the proposed rule the always-ask risk class and no deadline', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const [proposed] = await ctx.readProposedRules();

  expect([proposed?.row.riskClass, proposed?.row.deadlineAt]).toStrictEqual(['always_ask', null]);
});

test('it proposes nothing after 2 approved calls', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it proposes nothing when a call of the group was declined in the window', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();

  const declined = await ctx.ask({ to: 'sam@example.org' });

  await ctx.answer(declined, 'decline');
  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it counts the approvals of one destination only', async () => {
  const ctx = await setupTest();

  await ctx.approveSend('sam@example.org');
  await ctx.approveSend('kim@example.org');
  await ctx.approveSend('sam@example.org');

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it counts no approval older than the window', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();

  ctx.clock.advance(40 * ctx.dayMs);

  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it opens no second proposal for a group while one is open', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toHaveLength(1);
});

test('it keeps the group quiet for 30 days after Not now', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const [first] = await ctx.readProposedRules();

  invariant(first, 'the 3 approvals opened a proposal');

  await ctx.answer(first.row.id, 'decline');
  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it proposes again once the quiet days after Not now have passed', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const [first] = await ctx.readProposedRules();

  invariant(first, 'the 3 approvals opened a proposal');

  await ctx.answer(first.row.id, 'decline');

  ctx.clock.advance(31 * ctx.dayMs);

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toHaveLength(1);
});

test('it keeps the group quiet for 30 days after the proposal lapses', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  ctx.clock.advance(15 * ctx.dayMs);

  await ctx.runLapses();
  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it withdraws the open proposal when a new call of the group is declined', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const declined = await ctx.ask({ to: 'sam@example.org' });

  await ctx.answer(declined, 'decline');

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it adds nothing to the group when a call is answered with Always allow', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();

  const asked = await ctx.ask({ to: 'sam@example.org' });

  await ctx.answer(asked, 'always_allow', { ruleHash: 'x' });

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it adds nothing to the group when a call is deferred', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();

  const asked = await ctx.ask({ to: 'sam@example.org' });

  await ctx.answer(asked, 'defer', { deferUntil: ctx.clock.now() + ctx.dayMs });

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it counts no call whose proposal a record forget emptied', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();

  const forgotten = await ctx.approveWithoutCheck('sam@example.org');

  await ctx.forgetAsk(forgotten);
  await ctx.approveSend();

  const open = await ctx.readProposedRules();

  expect(open).toStrictEqual([]);
});

test('it proposes at start when a crash lost the check of the last answer', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveWithoutCheck('sam@example.org');

  const before = await ctx.readProposedRules();

  await ctx.runStartChecks();

  const after = await ctx.readProposedRules();

  expect([before.length, after.length]).toStrictEqual([0, 1]);
});

test('it checks no group again at start once its last answer was checked', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const checked = await ctx.runStartChecks();

  expect(checked).toBe(0);
});

test('it puts the approved rule in force with the reason that the export carries', async () => {
  const ctx = await setupTest();

  await ctx.approveSend();
  await ctx.approveSend();
  await ctx.approveSend();

  const [proposed] = await ctx.readProposedRules();

  invariant(proposed, 'the 3 approvals opened a proposal');

  const call = {
    tool: 'test.send',
    args: { to: 'sam@example.org', body: 'Hello', account: 'work' },
    destinations: [{ value: 'sam@example.org', replyTarget: false }],
  };

  const before = await ctx.decide(call);

  await ctx.answer(proposed.row.id, 'approve');
  await ctx.runInForceSeed();

  const after = await ctx.decide(call);
  const changes = await ctx.readRuntimeChanges();

  expect({ before: before.decision.outcome, after: after.decision.outcome, changes }).toStrictEqual(
    {
      before: 'ask',
      after: 'allow',
      changes: [{ reason: 'proposed after 3 approvals', changed_by: 'owner' }],
    },
  );
});
