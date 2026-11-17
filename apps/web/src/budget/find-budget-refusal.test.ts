import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { findBudgetRefusal } from './find-budget-refusal';

test('it finds the sentence of a call that a budget refused', () => {
  const refused = buildMockLogRecord({
    kind: 'tool_result',
    toolCall: {
      callID: 'call-1',
      outcome: 'denied',
      content: { message: 'budget reached: search-day ($5.00 of $5.00). Resets at midnight.' },
    },
  });

  expect(findBudgetRefusal([refused])).toBe(
    'budget reached: search-day ($5.00 of $5.00). Resets at midnight.',
  );
});

test('it finds nothing once a later call settled', () => {
  const refused = buildMockLogRecord({
    kind: 'tool_result',
    sequence: 1,
    toolCall: {
      callID: 'call-1',
      outcome: 'denied',
      content: { message: 'budget reached: search-day ($5.00 of $5.00). Resets at midnight.' },
    },
  });

  const settled = buildMockLogRecord({
    kind: 'tool_result',
    sequence: 2,
    toolCall: { callID: 'call-2', outcome: 'result', content: { text: 'a note' } },
  });

  expect(findBudgetRefusal([refused, settled])).toBeNull();
});

test('it finds nothing for a denial that no budget caused', () => {
  const denied = buildMockLogRecord({
    kind: 'tool_result',
    toolCall: { callID: 'call-1', outcome: 'denied', content: { message: 'denied: no rule' } },
  });

  expect(findBudgetRefusal([denied])).toBeNull();
});
