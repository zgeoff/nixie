import { expect, test } from 'bun:test';
import type { RuntimeRuleRowInput } from './build-runtime-rule-row';
import { buildRuntimeRuleRow } from './build-runtime-rule-row';

interface RowHashes {
  readonly base_hash: string | null;
  readonly definitions_hash: string | null;
  readonly supersededID: string | null;
}

test.each<[string, Pick<RuntimeRuleRowInput, 'previous' | 'definitionsHash'>, RowHashes]>([
  [
    'a first change takes the definitions version as its base',
    { previous: null, definitionsHash: 'h-ask' },
    { base_hash: 'h-ask', definitions_hash: 'h-ask', supersededID: null },
  ],
  [
    "a second change keeps the first change's base and supersedes it",
    { previous: { change_id: 'change-1', base_hash: 'h-ask' }, definitionsHash: 'h-ask-wider' },
    { base_hash: 'h-ask', definitions_hash: 'h-ask-wider', supersededID: 'change-1' },
  ],
  [
    'a change to a rule the definitions lack has no base',
    { previous: null, definitionsHash: null },
    { base_hash: null, definitions_hash: null, supersededID: null },
  ],
])('it builds the row where %s', (_name, read, expected) => {
  const write = buildRuntimeRuleRow({
    changeID: 'change-2',
    input: { ruleID: 'ask-mail', rule: null, changedBy: 'owner', reason: 'No mail this week.' },
    at: 5,
    ...read,
  });

  expect({
    base_hash: write.row.base_hash,
    definitions_hash: write.row.definitions_hash,
    supersededID: write.supersededID,
  }).toStrictEqual(expected);
});

test('it builds a removal with no stored version', () => {
  expect(
    buildRuntimeRuleRow({
      changeID: 'change-1',
      input: {
        ruleID: 'ask-mail',
        rule: null,
        changedBy: 'nixie',
        reason: 'You asked to drop it.',
      },
      previous: null,
      definitionsHash: 'h-ask',
      at: 5,
    }),
  ).toStrictEqual({
    row: {
      change_id: 'change-1',
      rule_id: 'ask-mail',
      rule_hash: null,
      state: 'in_force',
      base_hash: 'h-ask',
      definitions_hash: 'h-ask',
      changed_by: 'nixie',
      reason: 'You asked to drop it.',
      changed_at: 5,
      updated_at: 5,
    },
    stored: null,
    supersededID: null,
  });
});

test('it stores the version of a change, keyed by the hash its row holds', () => {
  const write = buildRuntimeRuleRow({
    changeID: 'change-1',
    input: {
      ruleID: 'deny-shell',
      rule: { outcome: 'deny', tools: ['shell.run'] },
      changedBy: 'owner',
      reason: 'No shell commands.',
    },
    previous: null,
    definitionsHash: null,
    at: 5,
  });

  expect({
    rule: write.stored?.rule,
    isRowKeyed: write.row.rule_hash !== null && write.row.rule_hash === write.stored?.hash,
  }).toStrictEqual({
    rule: { id: 'deny-shell', outcome: 'deny', tools: ['shell.run'] },
    isRowKeyed: true,
  });
});
