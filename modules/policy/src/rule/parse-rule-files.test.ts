import { expect, test } from 'bun:test';
import { parseRuleFiles } from './parse-rule-files';

test('it parses each rule with the file that holds it, sorted by ID', () => {
  const parsed = parseRuleFiles(
    new Map([
      [
        'rules/mail.yaml',
        [
          'ask-mail-attachments:',
          '  outcome: ask',
          '  tools: [mail.send]',
          '  checks:',
          '    - { arg: attachments, op: matches, value: "*" }',
          'allow-mail-to-team:',
          '  outcome: allow',
          '  tools: [mail.send]',
          '  destinations: ["*@example.com"]',
          '  note: Team mail never needs a card.',
          '',
        ].join('\n'),
      ],
      ['rules/reads.yaml', 'allow-reads:\n  outcome: allow\n  effects: [read, fetch]\n'],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    rules: [
      {
        path: 'rules/mail.yaml',
        rule: {
          id: 'allow-mail-to-team',
          outcome: 'allow',
          tools: ['mail.send'],
          destinations: ['*@example.com'],
          note: 'Team mail never needs a card.',
        },
      },
      {
        path: 'rules/reads.yaml',
        rule: { id: 'allow-reads', outcome: 'allow', effects: ['fetch', 'read'] },
      },
      {
        path: 'rules/mail.yaml',
        rule: {
          id: 'ask-mail-attachments',
          outcome: 'ask',
          tools: ['mail.send'],
          checks: [{ arg: 'attachments', op: 'matches', value: '*' }],
        },
      },
    ],
  });
});

test('it parses an empty rule file as no rules', () => {
  expect(parseRuleFiles(new Map([['rules/empty.yaml', '# nothing yet\n']]))).toStrictEqual({
    status: 'parsed',
    rules: [],
  });
});

test('it refuses an ID that two files hold', () => {
  const parsed = parseRuleFiles(
    new Map([
      ['rules/a.yaml', 'allow-reads:\n  outcome: allow\n  effects: [read]\n'],
      ['rules/b.yaml', 'allow-reads:\n  outcome: ask\n  effects: [read]\n'],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'refused',
    problems: [
      {
        path: 'rules/b.yaml',
        reason: 'the rule ID allow-reads is also in rules/a.yaml, and an ID names one rule',
      },
    ],
  });
});

test.each([
  ['a file that is not YAML', 'allow-reads: [unclosed\n'],
  ['an unknown field', 'allow-reads:\n  outcome: allow\n  effect: [read]\n'],
  ['an unknown outcome', 'allow-reads:\n  outcome: maybe\n'],
  ['an ID with capitals', 'Allow-Reads:\n  outcome: allow\n'],
  ['an empty tool list', 'allow-none:\n  outcome: allow\n  tools: []\n'],
  [
    'a check with an unknown operator',
    'ask-x:\n  outcome: ask\n  checks:\n    - { arg: to, op: like, value: x }\n',
  ],
  [
    'an in check without a list',
    'ask-x:\n  outcome: ask\n  checks:\n    - { arg: to, op: in, value: x }\n',
  ],
  ['a mandate rule without an expiry', 'allow-x:\n  outcome: allow\n  mandate: invites-today\n'],
  ['a pattern with a space', 'allow-x:\n  outcome: allow\n  destinations: ["pat @example.com"]\n'],
  [
    'a rule that holds both jobs and definitions',
    'allow-x:\n  outcome: allow\n  jobs: [a]\n  definitions: [b]\n',
  ],
  ['a file that is a list', '- outcome: allow\n'],
])('it refuses %s with the file at fault', (_label, text) => {
  const parsed = parseRuleFiles(new Map([['rules/broken.yaml', text]]));

  expect(parsed).toStrictEqual({
    status: 'refused',
    problems: expect.arrayContaining([{ path: 'rules/broken.yaml', reason: expect.any(String) }]),
  });
});

test('it names both fields when a rule holds jobs and definitions', () => {
  const parsed = parseRuleFiles(
    new Map([['rules/x.yaml', 'allow-x:\n  outcome: allow\n  jobs: [a]\n  definitions: [b]\n']]),
  );

  expect(parsed).toStrictEqual({
    status: 'refused',
    problems: [
      {
        path: 'rules/x.yaml',
        reason: 'allow-x.definitions: a rule holds definitions or its old name jobs, never both',
      },
    ],
  });
});

test('it reads the old names jobs and job as definitions and task', () => {
  const parsed = parseRuleFiles(
    new Map([
      ['rules/x.yaml', 'ask-x:\n  outcome: ask\n  contexts: [job, task]\n  jobs: [morning]\n'],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    rules: [
      {
        path: 'rules/x.yaml',
        rule: { id: 'ask-x', outcome: 'ask', contexts: ['task'], definitions: ['morning'] },
      },
    ],
  });
});
