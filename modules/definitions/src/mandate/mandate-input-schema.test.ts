import { expect, test } from 'bun:test';
import { mandateInputSchema } from './mandate-input-schema';

test('it takes a title, 1 allow rule and no expiry', () => {
  const parsed = mandateInputSchema.safeParse({
    title: 'Full authority over my calendar invites',
    rules: [{ outcome: 'allow', tools: ['calendar.respond'] }],
  });

  expect(parsed.success).toBeTrue();
});

test('it takes an expiry with an offset', () => {
  const parsed = mandateInputSchema.safeParse({
    title: 'Full authority over my calendar invites',
    rules: [{ outcome: 'allow', tools: ['calendar.respond'] }],
    expires: '2026-11-14T00:00:00+11:00',
  });

  expect(parsed.success).toBeTrue();
});

test.each([
  ['an empty title', { title: '', rules: [{ outcome: 'allow' }] }],
  ['a title of 121 characters', { title: 'x'.repeat(121), rules: [{ outcome: 'allow' }] }],
  ['no rule', { title: 'Nothing', rules: [] }],
  [
    '11 rules',
    { title: 'Too many', rules: Array.from({ length: 11 }, () => ({ outcome: 'allow' })) },
  ],
  ['an ask rule', { title: 'Ask', rules: [{ outcome: 'ask' }] }],
  ['a deny rule', { title: 'Deny', rules: [{ outcome: 'deny' }] }],
  ['a rule with an ID', { title: 'Named', rules: [{ outcome: 'allow', id: 'mine' }] }],
  ['a rule with its own mandate', { title: 'Own', rules: [{ outcome: 'allow', mandate: 'mine' }] }],
  [
    'a rule with its own expiry',
    { title: 'Own end', rules: [{ outcome: 'allow', expires: '2026-11-14T00:00:00Z' }] },
  ],
  [
    'an expiry with no offset',
    { title: 'Local', rules: [{ outcome: 'allow' }], expires: '2026-11-14T00:00:00' },
  ],
])('it refuses %s', (_name, input) => {
  expect(mandateInputSchema.safeParse(input).success).toBeFalse();
});
