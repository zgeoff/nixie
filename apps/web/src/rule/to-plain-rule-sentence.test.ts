import { expect, test } from 'bun:test';
import { toPlainRuleSentence } from './to-plain-rule-sentence';

test('it drops the marks of a rule sentence and keeps every word', () => {
  expect(toPlainRuleSentence('**Allow** `calendar.respond`, until 2026-11-14T13:00:00Z.')).toBe(
    'Allow calendar.respond, until 2026-11-14T13:00:00Z.',
  );
});
