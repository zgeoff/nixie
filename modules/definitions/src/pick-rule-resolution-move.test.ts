import { expect, test } from 'bun:test';
import type { RuleResolutionInput, RuleResolutionMove } from './pick-rule-resolution-move';
import { pickRuleResolutionMove } from './pick-rule-resolution-move';

test.each<[string, RuleResolutionInput, RuleResolutionMove]>([
  [
    'keeps nixie on a change whose base the definitions moved from',
    {
      change: { change_id: 'change-1', base_hash: 'h-ask', definitions_hash: 'h-ask-wider' },
      definitionsHash: 'h-ask-wider',
      resolution: { ruleID: 'ask-mail', keep: 'nixie' },
    },
    { status: 'keep-nixie', changeID: 'change-1' },
  ],
  [
    "keeps the repo's version and seeds it",
    {
      change: { change_id: 'change-1', base_hash: 'h-ask', definitions_hash: 'h-ask-wider' },
      definitionsHash: 'h-ask-wider',
      resolution: { ruleID: 'ask-mail', keep: 'repo' },
    },
    { status: 'keep-repo', changeID: 'change-1', seededHash: 'h-ask-wider' },
  ],
  [
    'keeps the repo on a rule the repo deleted, with nothing to seed',
    {
      change: { change_id: 'change-1', base_hash: 'h-ask', definitions_hash: null },
      definitionsHash: null,
      resolution: { ruleID: 'ask-mail', keep: 'repo' },
    },
    { status: 'keep-repo', changeID: 'change-1', seededHash: null },
  ],
  [
    'refuses a rule with no runtime change',
    {
      change: null,
      definitionsHash: 'h-ask',
      resolution: { ruleID: 'ask-mail', keep: 'nixie' },
    },
    { status: 'refused', code: 'NOT_FOUND', reason: expect.any(String) },
  ],
  [
    'refuses a change whose base the definitions still hold',
    {
      change: { change_id: 'change-1', base_hash: 'h-ask', definitions_hash: 'h-ask' },
      definitionsHash: 'h-ask',
      resolution: { ruleID: 'ask-mail', keep: 'repo' },
    },
    { status: 'refused', code: 'NOT_FOUND', reason: expect.any(String) },
  ],
])('it %s', (_name, input, move) => {
  expect(pickRuleResolutionMove(input)).toStrictEqual(move);
});
