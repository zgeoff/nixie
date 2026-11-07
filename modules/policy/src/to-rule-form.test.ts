import { expect, test } from 'bun:test';
import { toRuleForm } from './to-rule-form';

test('it sorts each list and drops its duplicates', () => {
  const form = toRuleForm({
    id: 'ask-mail',
    outcome: 'ask',
    tools: ['mail.send', 'mail.reply', 'mail.send'],
    effects: ['send', 'read'],
    destinations: ['*.org', '*.net'],
    checks: [
      { arg: 'model', op: 'in', value: ['sol', 'glm', 'sol'] },
      { arg: 'memory', op: 'eq', value: 'read' },
    ],
  });

  expect(form).toStrictEqual({
    id: 'ask-mail',
    outcome: 'ask',
    tools: ['mail.reply', 'mail.send'],
    effects: ['read', 'send'],
    destinations: ['*.net', '*.org'],
    checks: [
      { arg: 'memory', op: 'eq', value: 'read' },
      { arg: 'model', op: 'in', value: ['glm', 'sol'] },
    ],
  });
});

test('it turns free text into NFC and the expiry into UTC', () => {
  const form = toRuleForm({
    id: 'allow-cafe',
    outcome: 'allow',
    destinations: ['cafe\u0301@example.com'],
    expires: '2026-11-08T01:00:00+02:00',
    note: 'Cafe\u0301 bookings.',
  });

  expect(form).toStrictEqual({
    id: 'allow-cafe',
    outcome: 'allow',
    destinations: ['caf\u00E9@example.com'],
    expires: '2026-11-07T23:00:00.000Z',
    note: 'Caf\u00E9 bookings.',
  });
});
