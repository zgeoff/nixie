import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { render } from '../test-utils/render';
import { ConversationFailureNotice } from './conversation-failure-notice';

test('it shows that nixie is failing once its turns fail the error limit of times in a row', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 3,
      retryAt: new Date('2026-10-14T09:04:00Z'),
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<ConversationFailureNotice records={[errored]} />);

  expect(rendered.getByRole('alert')).toHaveTextContent(
    /^nixie failed to answer 3 times in a row\. It tries again at \d{1,2}:\d{2}\s?(?:AM|PM)?, or when you send a message\.$/u,
  );
});

test('it shows the failure from the last step end when the page no longer holds it', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    sequence: 10,
    task: {
      errorLimit: 3,
      errors: 3,
      retryAt: new Date('2026-10-14T09:04:00Z'),
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const started = buildMockLogRecord({
    kind: 'task.step_started',
    sequence: 11,
    task: { stepKey: 'conversation:1', taskID: 'conversation' },
  });

  const rendered = render(<ConversationFailureNotice lastStepEnd={errored} records={[started]} />);

  expect(rendered.getByRole('alert')).toHaveTextContent(
    /^nixie failed to answer 3 times in a row/u,
  );
});

test('it shows nothing while the turns that failed in a row stay under the limit', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 2,
      retryAt: new Date('2026-10-14T09:01:00Z'),
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<ConversationFailureNotice records={[errored]} />);

  expect(rendered.queryByRole('alert')).toBeNull();
});
