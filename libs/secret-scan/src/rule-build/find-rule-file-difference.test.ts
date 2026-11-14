import { expect, test } from 'bun:test';
import { buildRuleFile } from './build-rule-file';
import { findRuleFileDifference } from './find-rule-file-difference';

test('it finds no difference when the committed text is what the builder makes', () => {
  const sourceText = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
`;

  const committed = buildRuleFile(sourceText, 'MIT License\n');

  expect(findRuleFileDifference(committed, sourceText, 'MIT License\n')).toBeNull();
});

test('it finds a difference when the committed text was edited', () => {
  const sourceText = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
`;

  const committed = buildRuleFile(sourceText, 'MIT License\n').replace('tok_', 'ok_');

  expect(findRuleFileDifference(committed, sourceText, 'MIT License\n')).toMatch(/line \d+/u);
});

test('it finds a difference when the source gained a rule', () => {
  const sourceText = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
`;

  const committed = buildRuleFile(sourceText, 'MIT License\n');
  const newSource = `${sourceText}\n[[rules]]\nid = "extra"\nregex = '''extra_([a-z]+)'''\n`;

  expect(findRuleFileDifference(committed, newSource, 'MIT License\n')).toMatch(/differs/u);
});

test('it finds a difference when the licence changed', () => {
  const sourceText = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
`;

  const committed = buildRuleFile(sourceText, 'MIT License\n');

  expect(findRuleFileDifference(committed, sourceText, 'Other License\n')).toMatch(/line \d+/u);
});

test('it lists the clauses and rules it left out, and the licence, in the header', () => {
  const sourceText = `
[[rules]]
id = "tok"
regex = '''tok_([a-z]+)'''
filter = '''
entropy(finding["secret"]) < 2.0 || filter.tokenRatio(finding["secret"]) >= 2.5
'''

[[rules]]
id = "by-path"
regex = '''x_([a-z]+)'''
path = '''\\.p12$'''
`;

  const header = buildRuleFile(sourceText, 'MIT License\n\nCopyright (c) 2026 An Author\n')
    .split('\n')
    .filter((line) => line.startsWith('//'))
    .join('\n');

  expect(header).toContain('//   tok: filter.tokenRatio(finding["secret"]) >= 2.5');
  expect(header).toContain('//   by-path: it matches a file path');
  expect(header).toContain('// Copyright (c) 2026 An Author');
  expect(header).toContain('// Generated. Do not edit.');
});
