import { expect, test } from 'bun:test';
import { buildModelView } from './build-model-view';

test('it shows a done action with the connector result', () => {
  const view = buildModelView(
    { action_id: 'action-1', status: 'done', reason: null },
    {
      sequence: 9,
      recordedAt: new Date(0),
      kind: 'action.outcome',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { actionID: 'action-1', status: 'done', attempt: 1, reason: null },
      erasable: { status: 'readable', fields: { result: { messageID: 'm-1' } } },
    },
  );

  expect(view).toStrictEqual({
    status: 'done',
    actionID: 'action-1',
    result: { messageID: 'm-1' },
  });
});

test('it shows a done action whose result was forgotten with no result', () => {
  const view = buildModelView(
    { action_id: 'action-1', status: 'done', reason: null },
    {
      sequence: 9,
      recordedAt: new Date(0),
      kind: 'action.outcome',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { actionID: 'action-1', status: 'done', attempt: 1, reason: null },
      erasable: { status: 'shredded' },
    },
  );

  expect(view).toStrictEqual({ status: 'done', actionID: 'action-1', result: null });
});

test('it shows a failed action with the provider reason', () => {
  const view = buildModelView(
    { action_id: 'action-1', status: 'failed', reason: 'refused' },
    {
      sequence: 9,
      recordedAt: new Date(0),
      kind: 'action.outcome',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'task-1',
      stepKey: null,
      parent: null,
      contentSource: null,
      decision: null,
      promptCause: null,
      approval: null,
      payload: { actionID: 'action-1', status: 'failed', attempt: 1, reason: 'refused' },
      erasable: { status: 'readable', fields: { message: 'no such recipient' } },
    },
  );

  expect(view).toStrictEqual({
    status: 'failed',
    actionID: 'action-1',
    reason: 'no such recipient',
  });
});

test('it shows a failed action with no provider text by its reason code', () => {
  const view = buildModelView(
    { action_id: 'action-1', status: 'failed', reason: 'unknown_tool' },
    null,
  );

  expect(view).toStrictEqual({ status: 'failed', actionID: 'action-1', reason: 'unknown_tool' });
});

test('it shows a pending action as queued under its ID', () => {
  const view = buildModelView({ action_id: 'action-1', status: 'pending', reason: null }, null);

  expect(view).toStrictEqual({
    status: 'pending',
    actionID: 'action-1',
    message: 'queued as `action-1`',
  });
});

test('it shows an unknown action as a question put to you', () => {
  const view = buildModelView(
    { action_id: 'action-1', status: 'unknown', reason: 'attempt_without_result' },
    null,
  );

  expect(view).toStrictEqual({
    status: 'unknown',
    actionID: 'action-1',
    message: 'you were asked whether this happened',
  });
});
