import { expect, test } from 'bun:test';
import { pickProposalChoices } from './pick-proposal-choices';

test('it offers always allow for a routine action with a rule', () => {
  const choices = pickProposalChoices({
    kind: 'action',
    riskClass: 'routine',
    cause: 'outside_steering',
    ruleHash: 'rule-hash',
  });

  expect(choices).toStrictEqual(['approve', 'always_allow', 'defer', 'decline']);
});

test('it withholds always allow from an always-ask action', () => {
  const choices = pickProposalChoices({
    kind: 'action',
    riskClass: 'always_ask',
    cause: 'outside_steering',
    ruleHash: 'rule-hash',
  });

  expect(choices).toStrictEqual(['approve', 'defer', 'decline']);
});

test('it withholds always allow from an action with no rule', () => {
  const choices = pickProposalChoices({
    kind: 'action',
    riskClass: 'routine',
    cause: 'outside_steering',
    ruleHash: null,
  });

  expect(choices).toStrictEqual(['approve', 'defer', 'decline']);
});

test('it withholds always allow from an action that a rule held', () => {
  const choices = pickProposalChoices({
    kind: 'action',
    riskClass: 'routine',
    cause: 'ask_rule',
    ruleHash: 'rule-hash',
  });

  expect(choices).toStrictEqual(['approve', 'defer', 'decline']);
});

test('it withholds always allow from a memory write', () => {
  const choices = pickProposalChoices({
    kind: 'memory_write',
    riskClass: 'routine',
    cause: 'outside_steering',
    ruleHash: 'rule-hash',
  });

  expect(choices).toStrictEqual(['approve', 'defer', 'decline']);
});
