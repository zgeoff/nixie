import { expect, test } from 'bun:test';
import type { BudgetDefinition } from '../budget/parse-budget-files';
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
    warnings: [],
  });
});

test('it parses an empty rule file as no rules', () => {
  expect(parseRuleFiles(new Map([['rules/empty.yaml', '# nothing yet\n']]))).toStrictEqual({
    status: 'parsed',
    rules: [],
    warnings: [],
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
  [
    'an unknown field inside a check',
    'ask-x:\n  outcome: ask\n  checks:\n    - { arg: to, op: eq, value: x, extra: 1 }\n',
  ],
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
    warnings: [],
  });
});

test('it skips an allow rule that holds an unknown field, and warns', () => {
  const parsed = parseRuleFiles(
    new Map([
      [
        'rules/x.yaml',
        'allow-x:\n  outcome: allow\n  effect: [read]\nallow-y:\n  outcome: allow\n  effects: [read]\n',
      ],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    rules: [{ path: 'rules/x.yaml', rule: { id: 'allow-y', outcome: 'allow', effects: ['read'] } }],
    warnings: [{ path: 'rules/x.yaml', ruleID: 'allow-x', field: 'effect', action: 'skipped' }],
  });
});

test('it refuses a file whose allow rule holds an unknown field and a bad checks entry', () => {
  const parsed = parseRuleFiles(
    new Map([
      [
        'rules/x.yaml',
        'allow-x:\n  outcome: allow\n  future: true\n  checks:\n    - { arg: to, op: eq, value: x, extra: 1 }\n',
      ],
    ]),
  );

  expect(parsed.status).toBe('refused');
});

test.each(['ask', 'deny'])(
  'it drops the unknown field of a %s rule and keeps the rest',
  (outcome) => {
    const parsed = parseRuleFiles(
      new Map([
        [
          'rules/x.yaml',
          `${outcome}-x:\n  outcome: ${outcome}\n  tools: [mail.send]\n  risk: high\n`,
        ],
      ]),
    );

    expect(parsed).toStrictEqual({
      status: 'parsed',
      rules: [
        { path: 'rules/x.yaml', rule: { id: `${outcome}-x`, outcome, tools: ['mail.send'] } },
      ],
      warnings: [
        { path: 'rules/x.yaml', ruleID: `${outcome}-x`, field: 'risk', action: 'dropped' },
      ],
    });
  },
);

test('it parses a lift on an allow rule whose budget counts spend', () => {
  const parsed = parseRuleFiles(
    new Map([
      [
        'rules/shop.yaml',
        'allow-groceries:\n  outcome: allow\n  tools: [shop.order]\n  lift: { perAction: 20, budget: shopping-month }\n',
      ],
    ]),
    new Map([
      [
        'shopping-month',
        { id: 'shopping-month', counts: 'spend', limitMicros: 100_000_000, period: 'month' },
      ],
    ]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    rules: [
      {
        path: 'rules/shop.yaml',
        rule: {
          id: 'allow-groceries',
          outcome: 'allow',
          tools: ['shop.order'],
          lift: { perAction: 20, budget: 'shopping-month' },
        },
      },
    ],
    warnings: [],
  });
});

test.each([
  [
    'a lift on an ask rule',
    'ask-x:\n  outcome: ask\n  lift: { perAction: 20, budget: shopping-month }\n',
    'ask-x.lift: a lift is valid only on an allow rule',
  ],
  [
    'a lift with no budget',
    'allow-x:\n  outcome: allow\n  lift: { perAction: 20 }\n',
    'allow-x.lift.budget: Invalid input: expected string, received undefined',
  ],
  [
    'a lift with no cap per action',
    'allow-x:\n  outcome: allow\n  lift: { budget: shopping-month }\n',
    'allow-x.lift.perAction: Invalid input: expected number, received undefined',
  ],
  [
    'a lift of a budget the definitions lack',
    'allow-x:\n  outcome: allow\n  lift: { perAction: 20, budget: pet-month }\n',
    'allow-x.lift.budget: the definitions have no budget pet-month',
  ],
  [
    'a lift of a budget that counts a tool',
    'allow-x:\n  outcome: allow\n  lift: { perAction: 20, budget: search-day }\n',
    'allow-x.lift.budget: the budget search-day counts tool:search, and a lift needs a budget that counts spend',
  ],
])('it refuses %s', (_label, text, reason) => {
  const parsed = parseRuleFiles(
    new Map([['rules/x.yaml', text]]),
    new Map<string, BudgetDefinition>([
      [
        'shopping-month',
        { id: 'shopping-month', counts: 'spend', limitMicros: 100_000_000, period: 'month' },
      ],
      [
        'search-day',
        { id: 'search-day', counts: 'tool:search', limitMicros: 5_000_000, period: 'day' },
      ],
    ]),
  );

  expect(parsed).toStrictEqual({ status: 'refused', problems: [{ path: 'rules/x.yaml', reason }] });
});

test('it skips an allow rule with a field it does not know, as the release before does with lift', () => {
  const parsed = parseRuleFiles(
    new Map([['rules/x.yaml', 'allow-x:\n  outcome: allow\n  lifted: { perAction: 20 }\n']]),
  );

  expect(parsed).toStrictEqual({
    status: 'parsed',
    rules: [],
    warnings: [{ path: 'rules/x.yaml', ruleID: 'allow-x', field: 'lifted', action: 'skipped' }],
  });
});

test('it parses a rule with a condition and a note', () => {
  const parsed = parseRuleFiles(
    new Map([
      [
        'rules/school.yaml',
        [
          'allow-term-mail-in-hours:',
          '  outcome: allow',
          '  tools: [mail.send]',
          "  destinations: ['*@school.example']",
          '  cel: now.getHours("Europe/London") < 17 && args.subject.startsWith("Term")',
          '  note: School mail about the term can go out during the working day.',
          '',
        ].join('\n'),
      ],
    ]),
  );

  expect(parsed).toMatchObject({
    status: 'parsed',
    rules: [
      {
        rule: {
          id: 'allow-term-mail-in-hours',
          cel: 'now.getHours("Europe/London") < 17 && args.subject.startsWith("Term")',
          note: 'School mail about the term can go out during the working day.',
        },
      },
    ],
  });
});

test.each([
  ['no note', 'cel: args.n == 1', 'condition_note_missing'],
  ['text that does not parse', 'cel: args.n ==\n  note: Broken.', 'condition_syntax'],
  [
    'a construct outside the subset',
    'cel: args.name.matches("a")\n  note: Matches.',
    'condition_not_allowed',
  ],
  ['a type error', 'cel: tool == 1\n  note: Wrong type.', 'condition_type'],
  [
    'text over the length limit',
    `cel: 'args.s == "${'a'.repeat(1000)}"'\n  note: Long.`,
    'condition_too_large',
  ],
])(
  'it refuses the seed of a rule with %s, with the fault code and the rule',
  (_label, lines, fault) => {
    const parsed = parseRuleFiles(
      new Map([['rules/school.yaml', `allow-mail:\n  outcome: allow\n  ${lines}\n`]]),
    );

    expect(parsed).toStrictEqual({
      status: 'refused',
      problems: [
        { path: 'rules/school.yaml', reason: expect.stringContaining(`allow-mail.cel: ${fault}`) },
      ],
    });
  },
);
