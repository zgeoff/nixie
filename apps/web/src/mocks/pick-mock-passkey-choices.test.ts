import { expect, test } from 'bun:test';
import { pickMockPasskeyChoices } from './pick-mock-passkey-choices';

test('it gates only the approval of an always-ask row', () => {
  const choices = pickMockPasskeyChoices({
    choices: ['approve', 'defer', 'decline'],
    riskClass: 'always_ask',
  });

  expect(choices).toStrictEqual(['approve']);
});

test('it gates nothing on a routine row', () => {
  const choices = pickMockPasskeyChoices({
    choices: ['approve', 'always_allow', 'defer', 'decline'],
    riskClass: 'routine',
  });

  expect(choices).toStrictEqual([]);
});
