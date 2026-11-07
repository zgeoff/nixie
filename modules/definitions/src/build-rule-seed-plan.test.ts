import { expect, test } from 'bun:test';
import { buildRuleSeedPlan } from './build-rule-seed-plan';

test('it applies a definitions edit that narrows and seeds the new version', () => {
  const plan = buildRuleSeedPlan({
    definitions: [
      {
        hash: 'h-deny',
        rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] },
        path: 'rules/mail.yaml',
      },
    ],
    seeded: [{ hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } }],
    runtime: [],
  });

  expect(plan).toStrictEqual({
    seeded: [{ hash: 'h-deny', rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] } }],
    applied: [
      {
        ruleID: 'mail',
        before: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        after: { hash: 'h-deny', rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] } },
        change: 'narrowing',
      },
    ],
    held: [],
    adopted: [],
    overlaid: [],
    inForce: [
      {
        rule: { hash: 'h-deny', rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] } },
        changeID: null,
      },
    ],
  });
});

test('it holds a definitions edit that widens and keeps the seeded version in force', () => {
  const plan = buildRuleSeedPlan({
    definitions: [
      {
        hash: 'h-ask',
        rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] },
        path: 'rules/mail.yaml',
      },
    ],
    seeded: [{ hash: 'h-deny', rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] } }],
    runtime: [],
  });

  expect(plan).toStrictEqual({
    seeded: [{ hash: 'h-deny', rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] } }],
    applied: [],
    held: [
      {
        ruleID: 'mail',
        before: { hash: 'h-deny', rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] } },
        after: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        change: 'widening',
      },
    ],
    adopted: [],
    overlaid: [],
    inForce: [
      {
        rule: { hash: 'h-deny', rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] } },
        changeID: null,
      },
    ],
  });
});

test.each<[string, string, 'allow' | 'deny', string[]]>([
  ['an allow', 'narrowing', 'allow', []],
  ['a deny', 'widening', 'deny', ['web']],
])('it plans the removal of %s from the definitions as a %s', (_name, change, outcome, inForce) => {
  const plan = buildRuleSeedPlan({
    definitions: [],
    seeded: [{ hash: 'h-web', rule: { id: 'web', outcome, tools: ['web.fetch'] } }],
    runtime: [],
  });

  expect({
    changes: [...plan.applied, ...plan.held].map((edit) => [edit.ruleID, edit.change]),
    inForce: plan.inForce.map((entry) => entry.rule.rule.id),
  }).toStrictEqual({ changes: [['web', change]], inForce });
});

test('it keeps a runtime change in force over a definitions edit to its rule', () => {
  const plan = buildRuleSeedPlan({
    definitions: [
      {
        hash: 'h-deny',
        rule: { id: 'mail', outcome: 'deny', tools: ['mail.send'] },
        path: 'rules/mail.yaml',
      },
    ],
    seeded: [{ hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } }],
    runtime: [
      {
        changeID: 'change-1',
        ruleID: 'mail',
        rule: { hash: 'h-allow', rule: { id: 'mail', outcome: 'allow', tools: ['mail.send'] } },
        base: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        beneath: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        changedBy: 'owner',
        reason: 'Mail to the team is fine.',
        changedAt: 1,
      },
    ],
  });

  expect({
    applied: plan.applied,
    held: plan.held,
    inForce: plan.inForce.map((entry) => [entry.rule.hash, entry.changeID]),
  }).toStrictEqual({ applied: [], held: [], inForce: [['h-allow', 'change-1']] });
});

test('it adopts a runtime change once the definitions hold its version', () => {
  const plan = buildRuleSeedPlan({
    definitions: [
      {
        hash: 'h-allow',
        rule: { id: 'mail', outcome: 'allow', tools: ['mail.send'] },
        path: 'rules/mail.yaml',
      },
    ],
    seeded: [{ hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } }],
    runtime: [
      {
        changeID: 'change-1',
        ruleID: 'mail',
        rule: { hash: 'h-allow', rule: { id: 'mail', outcome: 'allow', tools: ['mail.send'] } },
        base: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        beneath: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        changedBy: 'owner',
        reason: 'Mail to the team is fine.',
        changedAt: 1,
      },
    ],
  });

  expect({
    adopted: plan.adopted.map((change) => change.changeID),
    applied: plan.applied.map((edit) => [edit.ruleID, edit.change]),
    inForce: plan.inForce.map((entry) => [entry.rule.hash, entry.changeID]),
  }).toStrictEqual({
    adopted: ['change-1'],
    applied: [['mail', 'unchanged']],
    inForce: [['h-allow', null]],
  });
});

test('it leaves out a rule that a runtime change removed', () => {
  const plan = buildRuleSeedPlan({
    definitions: [
      {
        hash: 'h-ask',
        rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] },
        path: 'rules/mail.yaml',
      },
    ],
    seeded: [{ hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } }],
    runtime: [
      {
        changeID: 'change-1',
        ruleID: 'mail',
        rule: null,
        base: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        beneath: { hash: 'h-ask', rule: { id: 'mail', outcome: 'ask', tools: ['mail.send'] } },
        changedBy: 'owner',
        reason: 'Mail no longer needs a check.',
        changedAt: 1,
      },
    ],
  });

  expect(plan.inForce).toStrictEqual([]);
});
