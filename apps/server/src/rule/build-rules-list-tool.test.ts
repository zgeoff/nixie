import { expect, test } from 'bun:test';
import { startTestRules } from '@heynixie/api/test-utils';
import { runMandateEnd, runMandateExpiry, writeRuntimeRule } from '@heynixie/definitions';
import type { MandateInput } from '@heynixie/definitions';
import { buildPolicyCall, readStarterDecisionPoint } from '@heynixie/policy/test-utils';
import { runProposalLapses } from '@heynixie/proposals';
import { buildMockToolContext } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { buildRulesListTool } from './build-rules-list-tool';

async function setupTest() {
  const rules = await startTestRules();

  const tool = buildRulesListTool({ log: rules.log, clock: rules.clock });

  const propose = async (input: MandateInput) => {
    const proposed = await rules.proposeMandate(input, 'nixie');

    invariant(proposed.status === 'proposed', 'the mandate was proposed');

    return proposed;
  };

  const start = async (input: MandateInput) => {
    const proposed = await propose(input);

    await rules.answer(proposed.proposalID, 'approve');

    return proposed;
  };

  const list = async () => {
    const outcome = await tool.run(
      { callID: 'call-1', tool: 'rules.list', input: {}, toolUseID: null },
      buildMockToolContext(),
    );

    invariant(outcome.status === 'ok', 'the list ran');

    return outcome.result;
  };

  return {
    ...rules,
    tool,
    propose,
    start,
    list,
    endNow: (mandateID: string) => runMandateEnd(rules.rulesContext, mandateID),
    runExpiry: () => runMandateExpiry(rules.rulesContext),
    runLapses: () => runProposalLapses(rules.deps),
    addRule: (ruleID: string, rule: Parameters<typeof writeRuntimeRule>[1]['rule']) =>
      writeRuntimeRule(rules.rulesContext, {
        ruleID,
        rule,
        changedBy: 'owner',
        reason: 'a test rule',
      }),
  };
}

test('it lists one mandate in each state, the newest proposal first', async () => {
  const ctx = await setupTest();

  const sends = [{ outcome: 'allow' as const, tools: ['test.send'] }];

  await ctx.propose({ title: 'Pending sends', rules: sends });
  await ctx.start({ title: 'Active sends', rules: sends });

  const rejected = await ctx.propose({ title: 'Rejected sends', rules: sends });

  await ctx.answer(rejected.proposalID, 'decline');
  await ctx.propose({ title: 'Lapsed sends', rules: sends, expires: '2026-11-02T10:00:00Z' });
  await ctx.start({ title: 'Expired sends', rules: sends, expires: '2026-11-02T10:00:00Z' });

  const ended = await ctx.start({ title: 'Ended sends', rules: sends });

  await ctx.endNow(ended.mandateID);

  ctx.clock.advance(2 * 60 * 60 * 1000);

  await ctx.runLapses();
  await ctx.runExpiry();

  const listed = await ctx.list();

  expect(listed).toStrictEqual({
    mandates: [
      expect.objectContaining({ title: 'Ended sends', state: 'ended' }),
      expect.objectContaining({ title: 'Expired sends', state: 'expired' }),
      expect.objectContaining({ title: 'Lapsed sends', state: 'lapsed' }),
      expect.objectContaining({ title: 'Rejected sends', state: 'rejected' }),
      expect.objectContaining({ title: 'Active sends', state: 'active' }),
      expect.objectContaining({ title: 'Pending sends', state: 'pending' }),
    ],
    rules: [],
  });
});

test('it gives each mandate its short ID, title, state, expiry and rules in words', async () => {
  const ctx = await setupTest();

  const proposed = await ctx.propose({
    title: 'Full authority over my test sends',
    rules: [
      { outcome: 'allow', tools: ['test.send'] },
      { outcome: 'allow', tools: ['test.reply'] },
    ],
  });

  const listed = await ctx.list();

  expect(listed).toStrictEqual({
    mandates: [
      {
        mandate: proposed.shortID,
        title: 'Full authority over my test sends',
        state: 'pending',
        expires: '2026-11-02T13:00:00.000Z',
        rules: [
          '**Allow** `test.send`, until 2026-11-02T13:00:00.000Z.',
          '**Allow** `test.reply`, until 2026-11-02T13:00:00.000Z.',
        ],
        conditions: [],
      },
    ],
    rules: [],
  });
});

test('it reads a mandate past its expiry as over before the sweep closes it', async () => {
  const ctx = await setupTest();

  const sends = [{ outcome: 'allow' as const, tools: ['test.send'] }];

  await ctx.propose({ title: 'Briefly', rules: sends, expires: '2026-11-02T10:00:00Z' });
  await ctx.start({ title: 'Briefly started', rules: sends, expires: '2026-11-02T10:00:00Z' });

  ctx.clock.advance(2 * 60 * 60 * 1000);

  const listed = await ctx.list();

  expect(listed).toStrictEqual({
    mandates: [
      expect.objectContaining({ title: 'Briefly started', state: 'expired' }),
      expect.objectContaining({ title: 'Briefly', state: 'lapsed' }),
    ],
    rules: [],
  });
});

test('it lists a mandate whose proposal a forget removed with no title and no rules', async () => {
  const ctx = await setupTest();

  const started = await ctx.start({
    title: 'Forgotten sends',
    rules: [{ outcome: 'allow', tools: ['test.send'] }],
  });

  await ctx.forgetMandateTitle(started.mandateID);

  const listed = await ctx.list();

  expect(listed).toStrictEqual({
    mandates: [
      {
        mandate: started.shortID,
        title: null,
        state: 'active',
        expires: '2026-11-02T13:00:00.000Z',
        rules: [],
        conditions: [],
      },
    ],
    rules: [],
  });
});

test('it lists the standing allow and ask rules for the conversation and no other rule', async () => {
  const ctx = await setupTest();

  await ctx.addRule('allow-chat-sends', {
    outcome: 'allow',
    tools: ['test.send'],
    contexts: ['conversation'],
  });

  await ctx.addRule('ask-shop', { outcome: 'ask', tools: ['shop.buy'] });
  await ctx.addRule('deny-shop', { outcome: 'deny', tools: ['shop.buy'] });

  await ctx.addRule('allow-task-sends', {
    outcome: 'allow',
    tools: ['test.send'],
    contexts: ['task'],
  });

  await ctx.addRule('ask-triage-sends', {
    outcome: 'ask',
    tools: ['test.send'],
    contexts: ['task'],
    definitions: ['inbox-triage'],
  });

  await ctx.start({ title: 'Mandate sends', rules: [{ outcome: 'allow', tools: ['test.send'] }] });

  const listed = await ctx.list();

  expect(listed).toStrictEqual({
    mandates: [expect.objectContaining({ title: 'Mandate sends', state: 'active' })],
    rules: [
      {
        rule: 'allow-chat-sends',
        sentence: '**Allow** `test.send` when it runs in a conversation.',
      },
      { rule: 'ask-shop', sentence: '**Ask** before `shop.buy`.' },
    ],
  });
});

test('it lists the note, the words and the expression of a standing rule with a condition', async () => {
  const ctx = await setupTest();

  await ctx.addRule('allow-term-mail', {
    outcome: 'allow',
    tools: ['test.send'],
    cel: 'now.getHours("Europe/London") < 17',
    note: 'Term mail goes out in the working day.',
  });

  const listed = await ctx.list();

  expect(listed).toStrictEqual({
    mandates: [],
    rules: [
      {
        rule: 'allow-term-mail',
        sentence: '**Allow** `test.send`, when its condition holds.',
        condition: {
          note: 'Term mail goes out in the working day.',
          noteBy: 'you',
          words: 'the hour in Europe/London is before 17',
          source: 'now.getHours("Europe/London") < 17',
        },
      },
    ],
  });
});

test('it lists the condition of a mandate rule with the note as nixie wrote it', async () => {
  const ctx = await setupTest();

  await ctx.propose({
    title: 'Term mail',
    rules: [
      {
        outcome: 'allow',
        tools: ['test.send'],
        cel: 'args.account == "work"',
        note: 'Work mail only.',
      },
    ],
  });

  const listed = await ctx.list();

  expect(listed).toMatchObject({
    mandates: [
      {
        conditions: [
          {
            rule: 1,
            note: 'Work mail only.',
            noteBy: 'nixie',
            words: '`args.account` is "work"',
            source: 'args.account == "work"',
          },
        ],
      },
    ],
  });
});

test('it is allowed under the starter rules in the conversation with no approval', async () => {
  const ctx = await setupTest();

  const decide = readStarterDecisionPoint(() => ctx.tool.declaration);

  const decided = await decide(
    buildPolicyCall({ tool: 'rules.list', toolList: ['rules.list'], context: 'conversation' }),
  );

  expect([ctx.tool.declaration.effects, decided.decision.outcome]).toStrictEqual([
    ['read'],
    'allow',
  ]);
});
