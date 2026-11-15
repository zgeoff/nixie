import { expect, test } from 'bun:test';
import { pickPasskeyChoices } from './pick-passkey-choices';

test('it gates the approval of an always-ask action', () => {
  const choices = pickPasskeyChoices({
    kind: 'action',
    riskClass: 'always_ask',
    cause: 'always_ask',
    ruleHash: null,
  });

  expect(choices).toStrictEqual(['approve']);
});

test('it gates the approval of a lifting rule change', () => {
  const choices = pickPasskeyChoices({
    kind: 'internal_change',
    riskClass: 'lifting',
    cause: 'rule_change',
    ruleHash: null,
  });

  expect(choices).toStrictEqual(['approve']);
});

test('it gates nothing on a routine action, even when it offers always allow', () => {
  const choices = pickPasskeyChoices({
    kind: 'action',
    riskClass: 'routine',
    cause: 'no_rule',
    ruleHash: 'rule-hash',
  });

  expect(choices).toStrictEqual([]);
});
