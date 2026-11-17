import { expect, test } from 'bun:test';
import { parseRuleSentence } from './parse-rule-sentence';

test('it splits a rule sentence into its outcome, its values and the words between them', () => {
  expect(
    parseRuleSentence(
      '**Allow** `calendar.respond` when every destination matches `*@example.org`.',
    ),
  ).toStrictEqual([
    { kind: 'strong', text: 'Allow' },
    { kind: 'text', text: ' ' },
    { kind: 'code', text: 'calendar.respond' },
    { kind: 'text', text: ' when every destination matches ' },
    { kind: 'code', text: '*@example.org' },
    { kind: 'text', text: '.' },
  ]);
});

test.each([
  ['a sentence with no marks', 'Remove the rule allow-tide-mail.'],
  ['an unclosed backtick', 'Allow `calendar.respond'],
  ['an unclosed bold mark', '**Allow calendar.respond'],
])('it keeps %s as one text part', (_name, sentence) => {
  expect(parseRuleSentence(sentence)).toStrictEqual([{ kind: 'text', text: sentence }]);
});

test('it keeps two stars inside a value as part of the value', () => {
  expect(parseRuleSentence('`**`')).toStrictEqual([{ kind: 'code', text: '**' }]);
});
