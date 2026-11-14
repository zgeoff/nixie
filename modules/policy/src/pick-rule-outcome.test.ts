import { expect, test } from 'bun:test';
import fc from 'fast-check';
import { pickRuleOutcome } from './pick-rule-outcome';
import type { Effect, Rule, RuleCall } from './types';

test('it picks a deny over an ask and an allow that match the same call', () => {
  const verdict = pickRuleOutcome(
    [
      { id: 'allow-sends', outcome: 'allow', effects: ['send'] },
      { id: 'ask-mail', outcome: 'ask', tools: ['mail.send'] },
      { id: 'deny-net-mail', outcome: 'deny', destinations: ['*.net'] },
    ],
    {
      tool: 'mail.send',
      effects: ['send'],
      context: 'conversation',
      task: null,
      args: {},
      destinations: ['stranger@example.net'],
      sources: [],
      at: 0,
    },
  );

  expect(verdict).toStrictEqual({ outcome: 'deny', ruleID: 'deny-net-mail', others: [] });
});

test('it picks an ask over an allow that matches the same call', () => {
  const verdict = pickRuleOutcome(
    [
      { id: 'allow-sends', outcome: 'allow', effects: ['send'] },
      { id: 'ask-mail', outcome: 'ask', tools: ['mail.send'] },
    ],
    {
      tool: 'mail.send',
      effects: ['send'],
      context: 'conversation',
      task: null,
      args: {},
      destinations: ['pat@example.com'],
      sources: [],
      at: 0,
    },
  );

  expect(verdict).toStrictEqual({ outcome: 'ask', ruleID: 'ask-mail', others: [] });
});

test('it names the matching rule with the lowest ID and lists the others', () => {
  const verdict = pickRuleOutcome(
    [
      { id: 'allow-team-mail', outcome: 'allow', destinations: ['*@example.com'] },
      { id: 'allow-sends', outcome: 'allow', effects: ['send'] },
      { id: 'allow-mail', outcome: 'allow', tools: ['mail.*'] },
    ],
    {
      tool: 'mail.send',
      effects: ['send'],
      context: 'conversation',
      task: null,
      args: {},
      destinations: ['pat@example.com'],
      sources: [],
      at: 0,
    },
  );

  expect(verdict).toStrictEqual({
    outcome: 'allow',
    ruleID: 'allow-mail',
    others: ['allow-sends', 'allow-team-mail'],
  });
});

test('it returns null when no rule matches the call', () => {
  const verdict = pickRuleOutcome([{ id: 'allow-reads', outcome: 'allow', effects: ['read'] }], {
    tool: 'lights.on',
    effects: ['device'],
    context: 'conversation',
    task: null,
    args: {},
    destinations: [],
    sources: [],
    at: 0,
  });

  expect(verdict).toBeNull();
});

test('it gives the same verdict for the same rules in any order', () => {
  const effects: readonly Effect[] = ['read', 'send', 'delete', 'note'];

  const ruleArbitrary = fc.record(
    {
      outcome: fc.constantFrom('allow', 'ask', 'deny'),
      tools: fc.uniqueArray(fc.constantFrom('mail.send', 'mail.*', 'files.remove', 'task.start'), {
        minLength: 1,
      }),
      effects: fc.uniqueArray(fc.constantFrom(...effects), { minLength: 1 }),
      destinations: fc.uniqueArray(fc.constantFrom('*@example.com', '*.net', 'pat@example.com'), {
        minLength: 1,
      }),
    },
    { requiredKeys: ['outcome'] },
  );

  const rulesArbitrary = fc
    .uniqueArray(fc.tuple(fc.stringMatching(/^[a-z]{1,6}$/u), ruleArbitrary), {
      selector: ([id]) => id,
      maxLength: 8,
    })
    .map((entries): Rule[] => entries.map(([id, body]) => ({ id, ...body })));

  const callArbitrary = fc.record({
    tool: fc.constantFrom('mail.send', 'files.remove', 'task.start/atc'),
    effects: fc.uniqueArray(fc.constantFrom(...effects), { maxLength: 3 }),
    destinations: fc.uniqueArray(
      fc.constantFrom('pat@example.com', 'lee@example.com', 'stranger@example.net'),
      { maxLength: 2 },
    ),
  });

  fc.assert(
    fc.property(
      rulesArbitrary.chain((rules) =>
        fc.tuple(fc.constant(rules), fc.shuffledSubarray(rules, { minLength: rules.length })),
      ),
      callArbitrary,
      ([rules, reordered], partial) => {
        const call: RuleCall = {
          ...partial,
          context: 'conversation',
          task: null,
          args: {},
          sources: [],
          at: 0,
        };

        expect(pickRuleOutcome(reordered, call)).toStrictEqual(pickRuleOutcome(rules, call));
      },
    ),
  );
});
