import { expect, test } from 'bun:test';
import { startTestRules } from '@heynixie/api/test-utils';
import {
  readActiveMandates,
  readMandateEndReason,
  runMandateEnd,
  runMandateExpiry,
  startMandateTimer,
  writeRuleEdit,
  writeRuntimeRule,
} from '@heynixie/definitions';
import { readRecords, withWriteTransaction } from '@heynixie/log';
import { readProposal, runProposalLapses } from '@heynixie/proposals';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const rules = await startTestRules();

  const hourMs = 60 * 60 * 1000;

  const sendCall = {
    tool: 'test.send',
    args: { to: 'sam@example.org', body: 'Hello', account: 'work' },
    destinations: [{ value: 'sam@example.org', replyTarget: false }],
  };

  const startMandate = async (expires?: string) => {
    const proposed = await rules.proposeMandate({
      title: 'Full authority over my test sends',
      rules: [{ outcome: 'allow', tools: ['test.send'], destinations: ['*@example.org'] }],
      ...(expires === undefined ? {} : { expires }),
    });

    invariant(proposed.status === 'proposed', 'the mandate was proposed');

    const row = await readProposal(rules.log.writer.db, proposed.proposalID);

    invariant(row, 'the proposal opened a row');

    await rules.answer(proposed.proposalID, 'approve');

    return { ...proposed, row };
  };

  const countEnded = async () => {
    const records = await readRecords(rules.log, {
      afterSequence: 0,
      kinds: ['rules.mandate_ended'],
    });

    return records.length;
  };

  return {
    ...rules,
    hourMs,
    sendCall,
    startMandate,
    countEnded,
    readActive: () => readActiveMandates(rules.log.writer.db),
    readEndReason: (mandateID: string) => readMandateEndReason(rules.log, mandateID),
    readChangeStates: async () => {
      const found = await rules.log.writer.db
        .withTables<{ runtime_rules: { state: string; rule_id: string } }>()
        .selectFrom('runtime_rules')
        .select(['rule_id', 'state'])
        .orderBy('rule_id')
        .execute();

      return found;
    },
    editRule: (ruleID: string, revision: number) =>
      withWriteTransaction(rules.log.writer, (tx) =>
        writeRuleEdit(tx, rules.context, {
          ruleID,
          request: { action: 'edit', revision, destinations: ['sam@example.org'] },
        }),
      ),
    runExpiry: () => runMandateExpiry(rules.rulesContext),
    endNow: (mandateID: string) => runMandateEnd(rules.rulesContext, mandateID),
    startTimer: () =>
      startMandateTimer({
        context: rules.rulesContext,
        clock: rules.clock,
        onError: () => {},
      }),
  };
}

test('it proposes a mandate that ends at the next midnight in your zone by default', async () => {
  const ctx = await setupTest();
  const proposed = await ctx.startMandate();

  expect(new Date(proposed.expires).toISOString()).toBe('2026-11-02T13:00:00.000Z');
});

test('it allows a matching call until the mandate expires and asks after', async () => {
  const ctx = await setupTest();

  await ctx.startMandate();

  const during = await ctx.decide(ctx.sendCall);

  ctx.clock.advance(5 * ctx.hourMs);

  const after = await ctx.decide(ctx.sendCall);

  expect([during.decision.outcome, after.decision.outcome]).toStrictEqual(['allow', 'ask']);
});

test('it decides a replay of a call made before the expiry as the record did', async () => {
  const ctx = await setupTest();

  await ctx.startMandate();

  const decided = await ctx.decideForReplay(ctx.sendCall);

  ctx.clock.advance(5 * ctx.hourMs);

  await ctx.runExpiry();

  const replayed = await decided.replay();

  expect([decided.outcome, replayed?.decision.outcome]).toStrictEqual(['allow', 'allow']);
});

test('it retires the rules of a mandate at once when you end it, and writes no removal', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();
  const ended = await ctx.endNow(started.mandateID);
  const after = await ctx.decide(ctx.sendCall);
  const states = await ctx.readChangeStates();

  expect({ ended, outcome: after.decision.outcome, states }).toStrictEqual({
    ended: 'ended',
    outcome: 'ask',
    states: [{ rule_id: `${started.mandateID}-1`, state: 'retired' }],
  });
});

test('it lists a started mandate with its rules, and none once it ended', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();
  const before = await ctx.readActive();

  await ctx.endNow(started.mandateID);

  const after = await ctx.readActive();

  expect({ before: before.map((mandate) => mandate.mandateID), after }).toStrictEqual({
    before: [started.mandateID],
    after: [],
  });
});

test('it writes one ended record when End now follows the timer', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();

  ctx.clock.advance(5 * ctx.hourMs);

  await ctx.runExpiry();

  const second = await ctx.endNow(started.mandateID);
  const reason = await ctx.readEndReason(started.mandateID);
  const count = await ctx.countEnded();

  expect({ second, reason, count }).toStrictEqual({
    second: 'not_active',
    reason: 'expired',
    count: 1,
  });
});

test('it writes one ended record when the timer follows End now', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();

  await ctx.endNow(started.mandateID);

  ctx.clock.advance(5 * ctx.hourMs);

  const ended = await ctx.runExpiry();
  const reason = await ctx.readEndReason(started.mandateID);
  const count = await ctx.countEnded();

  expect({ ended, reason, count }).toStrictEqual({ ended: 0, reason: 'ended', count: 1 });
});

test('it ends an overdue mandate at start', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();

  ctx.clock.advance(30 * ctx.hourMs);

  const ended = await ctx.runExpiry();
  const reason = await ctx.readEndReason(started.mandateID);

  expect({ ended, reason }).toStrictEqual({ ended: 1, reason: 'expired' });
});

test('it ends a mandate within a minute of its expiry with the timer', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();

  const timer = ctx.startTimer();

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(4 * ctx.hourMs);

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(60_000);

  await waitForCondition(async () => (await ctx.readEndReason(started.mandateID)) === 'expired');

  await timer.stop();

  const count = await ctx.countEnded();

  expect(count).toBe(1);
});

test('it refuses an expiry in the past', async () => {
  const ctx = await setupTest();

  const refused = await ctx.proposeMandate({
    title: 'Too late',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
    expires: '2026-11-01T09:00:00Z',
  });

  expect(refused).toStrictEqual({ status: 'refused', reason: 'expires_past' });
});

test('it refuses an expiry more than the longest mandate ahead', async () => {
  const ctx = await setupTest();

  const refused = await ctx.proposeMandate({
    title: 'Too long',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
    expires: '2026-11-03T09:00:01Z',
  });

  expect(refused).toStrictEqual({ status: 'refused', reason: 'expires_beyond_max' });
});

test('it accepts the longest expiry that the setting allows', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.proposeMandate({
    title: 'Just in time',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
    expires: '2026-11-03T09:00:00Z',
  });

  expect(proposed.status).toBe('proposed');
});

test('it refuses an edit of a mandate rule', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();
  const edit = await ctx.editRule(`${started.mandateID}-1`, 1);

  expect(edit).toStrictEqual({ status: 'refused', code: 'NOT_ALLOWED', reason: 'mandate' });
});

test('it refuses a runtime change that is not a mandate over the ID of a mandate rule', async () => {
  const ctx = await setupTest();
  const started = await ctx.startMandate();

  const change = writeRuntimeRule(ctx.rulesContext, {
    ruleID: `${started.mandateID}-1`,
    rule: { outcome: 'deny', tools: ['test.send'] },
    changedBy: 'owner',
    reason: 'a stand-in change',
  });

  await Promise.allSettled([change]);

  expect(change).rejects.toThrow('belongs to a mandate');
});

test('it gives a mandate that lets an always-ask effect through the lifting risk class', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.proposeMandate({
    title: 'Spend freely',
    rules: [{ outcome: 'allow', tools: ['shop.buy'], effects: ['spend'] }],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  const row = await readProposal(ctx.log.writer.db, proposed.proposalID);

  expect([row?.riskClass, row?.deadlineAt]).toStrictEqual(['lifting', proposed.expires]);
});

test('it lapses the proposal at the mandate expiry, so a late approval starts nothing', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.proposeMandate({
    title: 'Briefly',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  ctx.clock.advance(5 * ctx.hourMs);

  await runProposalLapses(ctx.deps);

  const answered = await ctx.answer(proposed.proposalID, 'approve');
  const active = await ctx.readActive();

  expect({ answered: answered.status, active }).toStrictEqual({ answered: 'refused', active: [] });
});

test('it declines a mandate with no rule put in force', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.proposeMandate({
    title: 'Not today',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
  });

  invariant(proposed.status === 'proposed', 'the mandate was proposed');

  await ctx.answer(proposed.proposalID, 'decline');

  const states = await ctx.readChangeStates();

  expect(states).toStrictEqual([]);
});
