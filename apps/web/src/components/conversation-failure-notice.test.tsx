import { expect, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { store } from '../mocks/store';
import { toLogRecord } from '../mocks/to-log-record';
import { buildMockLogRecord } from '../test-utils/build-mock-log-record';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { ConversationFailureNotice } from './conversation-failure-notice';

function setupTest() {
  return { user: userEvent.setup() };
}

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

test('it names the cause of a turn that waits for your retry, with a Retry button', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 1,
      isWaitingForRetry: true,
      reason: 'model_api.quota',
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<ConversationFailureNotice records={[errored]} />);

  expect({
    alert: rendered.getByRole('alert').textContent,
    button: rendered.getByRole('button').textContent,
  }).toStrictEqual({
    alert:
      'nixie failed to answer: Claude quota reached. It waits until you retry or send a message.',
    button: 'Retry',
  });
});

test('it names the cause of a turn the model API refused at its first failure, with its retry time', () => {
  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 1,
      reason: 'model_api.overloaded',
      retryAt: new Date('2026-10-14T09:01:00Z'),
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<ConversationFailureNotice records={[errored]} />);

  expect(rendered.getByRole('alert')).toHaveTextContent(
    /^nixie failed to answer: Claude is overloaded\. It tries again at \d{1,2}:\d{2}\s?(?:AM|PM)?, or when you send a message\.$/u,
  );
});

test('it retries the failed turn when you press Retry', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const stored = await store.records.create({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 1,
      isWaitingForRetry: true,
      reason: 'model_api.quota',
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<ConversationFailureNotice records={[toLogRecord(stored)]} />);

  await ctx.user.click(rendered.getByRole('button', { name: 'Retry' }));

  await waitFor(() => {
    expect(
      store.records.findFirst((query) => query.where({ kind: 'task.revived' }))?.task,
    ).toStrictEqual({ taskID: 'conversation' });
  });
});

test('it says so when the retry does not go through', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const errored = buildMockLogRecord({
    kind: 'task.step_errored',
    task: {
      errorLimit: 3,
      errors: 1,
      isWaitingForRetry: true,
      reason: 'model_api.quota',
      stepKey: 'conversation:1',
      taskID: 'conversation',
    },
  });

  const rendered = render(<ConversationFailureNotice records={[errored]} />);

  await ctx.user.click(rendered.getByRole('button', { name: 'Retry' }));

  const status = await rendered.findByRole('status');

  expect(status).toHaveTextContent('The retry did not go through.');
});
