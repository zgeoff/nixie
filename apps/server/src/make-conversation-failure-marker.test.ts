import { expect, test } from 'bun:test';
import { buildStartState } from './build-start-state';
import { makeConversationFailureMarker } from './make-conversation-failure-marker';

test('it marks the conversation imp unready once its errors in a row reach the limit', () => {
  const state = buildStartState({ isReady: true, reason: null });

  state.update({ conversation: { isReady: true, reason: null } });

  makeConversationFailureMarker(state)({
    taskID: 'conversation',
    stepKey: 'conversation:4',
    errors: 3,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_120_000,
    error: new Error('the provider is overloaded'),
  });

  expect(state.read().conversation).toStrictEqual({
    isReady: false,
    reason: 'the last 3 turns failed',
  });
});

test('it leaves the conversation imp ready while its errors in a row stay under the limit', () => {
  const state = buildStartState({ isReady: true, reason: null });

  state.update({ conversation: { isReady: true, reason: null } });

  makeConversationFailureMarker(state)({
    taskID: 'conversation',
    stepKey: 'conversation:3',
    errors: 2,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_060_000,
    error: new Error('the provider is overloaded'),
  });

  expect(state.read().conversation).toStrictEqual({ isReady: true, reason: null });
});

test("it leaves the conversation imp ready when another task's errors reach the limit", () => {
  const state = buildStartState({ isReady: true, reason: null });

  state.update({ conversation: { isReady: true, reason: null } });

  makeConversationFailureMarker(state)({
    taskID: 'memory-writer',
    stepKey: 'memory-writer:9',
    errors: 3,
    errorLimit: 3,
    nextState: 'failed',
    retryAt: 1_030_000,
    error: new Error('the provider is overloaded'),
  });

  expect(state.read().conversation).toStrictEqual({ isReady: true, reason: null });
});
