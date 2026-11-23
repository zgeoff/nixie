import { expect, test } from 'bun:test';
import { buildRuleExportChange } from './build-rule-export-change';

test('it replaces only the changed rule and keeps the comments and rules around it', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'ask-mail',
        rule: { hash: 'h-deny', rule: { id: 'ask-mail', outcome: 'deny', tools: ['mail.send'] } },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'No mail this week.',
        changedAt: 1,
      },
    ],
    files: new Map([
      [
        'rules/mail.yaml',
        '# Mail\nask-mail:\n  outcome: ask\n  tools: [mail.send]\n\n# Web\nallow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
      ],
    ]),
  });

  expect(change.files.get('rules/mail.yaml')).toBe(
    '# Mail\nask-mail:\n  outcome: "deny"\n  tools: ["mail.send"]\n\n# Web\nallow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );
});

test('it removes a rule that a runtime change took out', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'ask-mail',
        rule: null,
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'Mail no longer needs a check.',
        changedAt: 1,
      },
    ],
    files: new Map([
      [
        'rules/mail.yaml',
        'ask-mail:\n  outcome: ask\n  tools: [mail.send]\nallow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
      ],
    ]),
  });

  expect(change.files.get('rules/mail.yaml')).toBe(
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );
});

test('it removes a rule whose block holds a comment at column 0 and leaves the rule above it whole', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'ask-deletes',
        rule: null,
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'Deletes no longer need a check.',
        changedAt: 1,
      },
    ],
    files: new Map([
      [
        'rules/files.yaml',
        'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n\nask-deletes:\n  outcome: ask\n# effects: [send]\n  effects: [delete]\n',
      ],
    ]),
  });

  expect(change.files.get('rules/files.yaml')).toBe(
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );
});

test.each([
  ['a double-quoted key', '"ask-mail":'],
  ['a single-quoted key', "'ask-mail':"],
  ['a key with a space before its colon', 'ask-mail :'],
])('it replaces a rule written with %s', (_label, key) => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'ask-mail',
        rule: { hash: 'h-deny', rule: { id: 'ask-mail', outcome: 'deny', tools: ['mail.send'] } },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'No mail this week.',
        changedAt: 1,
      },
    ],
    files: new Map([['rules/mail.yaml', `${key}\n  outcome: ask\n  tools: [mail.send]\n`]]),
  });

  expect([...change.files]).toStrictEqual([
    ['rules/mail.yaml', 'ask-mail:\n  outcome: "deny"\n  tools: ["mail.send"]\n'],
  ]);
});

test('it deletes a rules file that a removal leaves empty', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'ask-mail',
        rule: null,
        base: null,
        beneath: null,
        changedBy: 'nixie',
        reason: 'You asked to drop the mail check.',
        changedAt: 1,
      },
    ],
    files: new Map([['rules/mail.yaml', 'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n']]),
  });

  expect([...change.files]).toStrictEqual([['rules/mail.yaml', null]]);
});

test('it adds a new rule to the rules file nixie writes to after an earlier change emptied it', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'ask-mail',
        rule: null,
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'Mail no longer needs a check.',
        changedAt: 1,
      },
      {
        changeID: 'change-2',
        ruleID: 'deny-shell',
        rule: {
          hash: 'h-shell',
          rule: { id: 'deny-shell', outcome: 'deny', tools: ['shell.run'] },
        },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'No shell commands.',
        changedAt: 2,
      },
    ],
    files: new Map([['rules/nixie.yaml', 'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n']]),
  });

  expect([...change.files]).toStrictEqual([
    ['rules/nixie.yaml', 'deny-shell:\n  outcome: "deny"\n  tools: ["shell.run"]\n'],
  ]);
});

test('it adds a new rule at the end of the rules file nixie writes to', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'deny-shell',
        rule: {
          hash: 'h-shell',
          rule: { id: 'deny-shell', outcome: 'deny', tools: ['shell.run'], note: 'No shell.' },
        },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'No shell commands.',
        changedAt: 1,
      },
    ],
    files: new Map([['rules/nixie.yaml', 'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n']]),
  });

  expect(change.files.get('rules/nixie.yaml')).toBe(
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\ndeny-shell:\n  outcome: "deny"\n  tools: ["shell.run"]\n  note: "No shell."\n',
  );
});

test('it writes a rule with the new names definitions and task', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'ask-triage',
        rule: {
          hash: 'h-triage',
          rule: {
            id: 'ask-triage',
            outcome: 'ask',
            contexts: ['task'],
            definitions: ['inbox-triage'],
          },
        },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'Ask before triage sends.',
        changedAt: 1,
      },
    ],
    files: new Map([['rules/triage.yaml', 'ask-triage:\n  outcome: ask\n']]),
  });

  expect(change.files.get('rules/triage.yaml')).toBe(
    'ask-triage:\n  outcome: "ask"\n  contexts: ["task"]\n  definitions: ["inbox-triage"]\n',
  );
});

test('it writes the lift of a rule as it writes every other field', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'allow-groceries',
        rule: {
          hash: 'h-lift',
          rule: {
            id: 'allow-groceries',
            outcome: 'allow',
            tools: ['shop.order'],
            lift: { perAction: 20, budget: 'shopping-month' },
          },
        },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'Groceries are routine.',
        changedAt: 1,
      },
    ],
    files: new Map(),
  });

  expect([...change.files.values()].join('')).toContain(
    'allow-groceries:\n  outcome: "allow"\n  tools: ["shop.order"]\n  lift:\n    perAction: 20\n    budget: "shopping-month"\n',
  );
});

// Each expected text below is what oxfmt leaves unchanged with its default options, checked by
// formatting the text with oxfmt and comparing it with the original.
test('it writes a short checks list as a block list of block mappings', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'allow-fetch',
        rule: {
          hash: 'h-fetch',
          rule: {
            id: 'allow-fetch',
            outcome: 'allow',
            tools: ['web.fetch'],
            checks: [{ arg: 'url', op: 'eq', value: 'https://example.com/a' }],
          },
        },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'Allow one page.',
        changedAt: 1,
      },
    ],
    files: new Map(),
  });

  expect(change.files.get('rules/nixie.yaml')).toBe(
    'allow-fetch:\n  outcome: "allow"\n  tools: ["web.fetch"]\n  checks:\n    - arg: "url"\n      op: "eq"\n      value: "https://example.com/a"\n',
  );
});

test('it writes a long list of strings as a block list and a short list of checks as block mappings', () => {
  const change = buildRuleExportChange({
    changes: [
      {
        changeID: 'change-1',
        ruleID: 'allow-fetch',
        rule: {
          hash: 'h-fetch',
          rule: {
            id: 'allow-fetch',
            outcome: 'allow',
            tools: [
              'web.fetch.one.aaaaaaaaaaaa',
              'web.fetch.two.bbbbbbbbbbbb',
              'web.fetch.three.cccccccc',
              'web.fetch.four.dddddddddd',
            ],
            checks: [
              { arg: 'url', op: 'eq', value: 'https://example.com/a' },
              { arg: 'command', op: 'matches', value: '^git ' },
            ],
          },
        },
        base: null,
        beneath: null,
        changedBy: 'owner',
        reason: 'Allow some pages.',
        changedAt: 1,
      },
    ],
    files: new Map(),
  });

  expect(change.files.get('rules/nixie.yaml')).toBe(
    [
      'allow-fetch:',
      '  outcome: "allow"',
      '  tools:',
      '    - "web.fetch.one.aaaaaaaaaaaa"',
      '    - "web.fetch.two.bbbbbbbbbbbb"',
      '    - "web.fetch.three.cccccccc"',
      '    - "web.fetch.four.dddddddddd"',
      '  checks:',
      '    - arg: "url"',
      '      op: "eq"',
      '      value: "https://example.com/a"',
      '    - arg: "command"',
      '      op: "matches"',
      '      value: "^git "',
      '',
    ].join('\n'),
  );
});
