import { expect, test } from 'bun:test';
import { createHealthApp } from '@heynixie/ops';
import { SandboxHostError } from '@heynixie/sandbox';
import { ModelAuthError } from '@heynixie/sessions';
import { buildReadinessChecks } from './build-readiness-checks';
import { buildStartState } from './build-start-state';
import { makeConversationFailureMarker } from './make-conversation-failure-marker';

function setupTest() {
  const state = buildStartState({ isReady: true, reason: null });

  state.update({
    definitions: { isReady: true, reason: null },
    areImagesAdded: true,
    conversation: { isReady: true, reason: null },
    areRunnersStarted: true,
  });

  const app = createHealthApp({
    liveness: {
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    ...buildReadinessChecks(state, { read: () => ({ isReady: true, reason: null }) }),
    log: () => {},
  });

  return { state, app };
}

test('it marks the conversation turns as failing once its errors in a row reach the limit', () => {
  const state = buildStartState({ isReady: true, reason: null });

  makeConversationFailureMarker(state)({
    taskID: 'conversation',
    stepKey: 'conversation:4',
    errors: 3,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_120_000,
    error: new Error('the provider is overloaded'),
  });

  expect(state.read().turns).toStrictEqual({
    isReady: false,
    reason: 'the last 3 turns failed',
  });
});

test('it names the host code in the mark when the last turn failed at the sandbox host', () => {
  const state = buildStartState({ isReady: true, reason: null });

  makeConversationFailureMarker(state)({
    taskID: 'conversation',
    stepKey: 'conversation:4',
    errors: 3,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_120_000,
    error: new SandboxHostError({
      call: 'wake',
      code: 'RAM_BUDGET_EXCEEDED',
      hostMessage: 'the budget is spent',
    }),
  });

  expect(state.read().turns).toStrictEqual({
    isReady: false,
    reason: 'the last 3 turns failed, the last at the sandbox host with RAM_BUDGET_EXCEEDED',
  });
});

test('it marks the conversation turns as failing at the first turn the model API refused for its credential', () => {
  const state = buildStartState({ isReady: true, reason: null });

  makeConversationFailureMarker(state)({
    taskID: 'conversation',
    stepKey: 'conversation:1',
    errors: 1,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_030_000,
    error: new ModelAuthError('Invalid API key · Fix external API key'),
  });

  expect(state.read().turns).toStrictEqual({
    isReady: false,
    reason: 'the last turn failed, the last because the model API refused the credential',
  });
});

test('it leaves the conversation turns passing while its errors in a row stay under the limit', () => {
  const state = buildStartState({ isReady: true, reason: null });

  makeConversationFailureMarker(state)({
    taskID: 'conversation',
    stepKey: 'conversation:3',
    errors: 2,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_060_000,
    error: new Error('the provider is overloaded'),
  });

  expect(state.read().turns).toStrictEqual({ isReady: true, reason: null });
});

test("it leaves the conversation turns passing when another task's errors reach the limit", () => {
  const state = buildStartState({ isReady: true, reason: null });

  makeConversationFailureMarker(state)({
    taskID: 'memory-writer',
    stepKey: 'memory-writer:9',
    errors: 3,
    errorLimit: 3,
    nextState: 'failed',
    retryAt: 1_030_000,
    error: new Error('the provider is overloaded'),
  });

  expect(state.read().turns).toStrictEqual({ isReady: true, reason: null });
});

test('it keeps readiness at 200 and shows the failing turns in its advisory parts after the error limit', async () => {
  const ctx = setupTest();

  makeConversationFailureMarker(ctx.state)({
    taskID: 'conversation',
    stepKey: 'conversation:7',
    errors: 3,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_120_000,
    error: new SandboxHostError({
      call: 'wake',
      code: 'RAM_BUDGET_EXCEEDED',
      hostMessage: 'the budget is spent',
    }),
  });

  const response = await ctx.app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: true, reason: null },
    },
    dependencies: {
      imp_host: { isReady: true, reason: null },
      conversation_imp: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
    advisory: {
      conversation_turns: {
        isReady: false,
        reason: 'the last 3 turns failed, the last at the sandbox host with RAM_BUDGET_EXCEEDED',
      },
    },
  });
});

test('it reports the conversation turns as not ready on readiness after one turn the model API refused for its credential', async () => {
  const ctx = setupTest();

  makeConversationFailureMarker(ctx.state)({
    taskID: 'conversation',
    stepKey: 'conversation:1',
    errors: 1,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_030_000,
    error: new ModelAuthError('Invalid API key · Fix external API key'),
  });

  const response = await ctx.app.handle(new Request('http://nixie/health/ready'));
  const body = await response.json();

  expect(response.status).toBe(200);

  expect(body).toStrictEqual({
    status: 'ready',
    parts: {
      database: { isReady: true, reason: null },
      definitions: { isReady: true, reason: null },
    },
    dependencies: {
      imp_host: { isReady: true, reason: null },
      conversation_imp: { isReady: true, reason: null },
      disk: { isReady: true, reason: null },
    },
    advisory: {
      conversation_turns: {
        isReady: false,
        reason: 'the last turn failed, the last because the model API refused the credential',
      },
    },
  });
});
