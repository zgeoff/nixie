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
