import { expect, test } from 'bun:test';
import { scanRuleSource } from './scan-rule-source';

test('it scans a text with the rules of the file', () => {
  const source = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
`;

  expect([scanRuleSource(source, 'tok_abc'), scanRuleSource(source, 'other')]).toStrictEqual([
    { rule: 'tok' },
    null,
  ]);
});
