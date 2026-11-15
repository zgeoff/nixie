import { expect, test } from 'bun:test';
import { formatApprovalCause } from './format-approval-cause';

function setupTest() {
  return {
    buildCauseFacts: (cause: string) => ({ proposal: { cause }, body: {} }),
  };
}

test.each([
  ['no_rule', 'no rule covers it yet.'],
  ['ask_rule', 'a rule of yours asks before it.'],
  ['always_ask', 'this kind of action always asks.'],
  ['outside_steering', 'it follows something nixie read outside your own words.'],
  ['skill_write', 'nixie wants to change one of its skills.'],
  ['rule_widening', 'the change lets a rule through that it did not before.'],
])('it words the cause %s in plain words', (cause, text) => {
  const ctx = setupTest();

  expect(formatApprovalCause(ctx.buildCauseFacts(cause))).toBe(text);
});

test('it words a cause it does not know as a generic reason', () => {
  const ctx = setupTest();

  expect(formatApprovalCause(ctx.buildCauseFacts('a_later_cause'))).toBe('it needs your answer.');
});

test('it words a memory proposal by its review reason', () => {
  const facts = {
    proposal: { cause: 'no_quote' },
    body: { memory: { reason: 'no_quote' as const } },
  };

  expect(formatApprovalCause(facts)).toBe('No quote from you backs it.');
});
