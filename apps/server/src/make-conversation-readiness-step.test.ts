import { expect, test } from 'bun:test';
import { buildStartState } from './build-start-state';
import { makeConversationReadinessStep } from './make-conversation-readiness-step';
import { buildMockStepInput } from './test-utils/build-mock-step-input';

test('it clears the failing mark on the turns after a turn that succeeds', async () => {
  const state = buildStartState({ isReady: true, reason: null });

  state.update({ turns: { isReady: false, reason: 'the last 3 turns failed' } });

  const result = await makeConversationReadinessStep(state, () =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [2] }),
  )(buildMockStepInput());

  expect(result).toStrictEqual({ next: 'wait', records: [], acknowledged: [2] });
  expect(state.read().turns).toStrictEqual({ isReady: true, reason: null });
});

test('it keeps the mark and rethrows when a turn fails', () => {
  const state = buildStartState({ isReady: true, reason: null });

  const failure = new Error('the provider is overloaded');

  state.update({ turns: { isReady: false, reason: 'the last 3 turns failed' } });

  const step = makeConversationReadinessStep(state, () => Promise.reject(failure));

  expect(step(buildMockStepInput())).rejects.toBe(failure);

  expect(state.read().turns).toStrictEqual({
    isReady: false,
    reason: 'the last 3 turns failed',
  });
});
