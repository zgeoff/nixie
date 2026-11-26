import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { render } from '../test-utils/render';
import { BudgetNotice } from './budget-notice';

test('it shows the budget and its reset when a budget refused the last call', () => {
  const refused = buildMockLogRecord({
    kind: 'tool_result',
    toolCall: {
      callID: 'call-1',
      outcome: 'denied',
      content: { message: 'budget reached: search-day. Resets at midnight.' },
    },
  });

  const rendered = render(<BudgetNotice records={[refused]} />);

  expect(rendered.getByRole('status')).toHaveTextContent(
    'budget reached: search-day. Resets at midnight.',
  );
});

test('it shows nothing when no budget refused a call', () => {
  const settled = buildMockLogRecord({
    kind: 'tool_result',
    toolCall: { callID: 'call-1', outcome: 'result', content: { text: 'a note' } },
  });

  const rendered = render(<BudgetNotice records={[settled]} />);

  expect(rendered.queryByRole('status')).toBeNull();
});
