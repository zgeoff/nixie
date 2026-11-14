import { expect, test } from 'bun:test';
import { buildStepFailurePlan } from './build-step-failure-plan';
import { StepFailedError } from './step-failed-error';

test.each([
  {
    name: 'a task on a try below its limit',
    isConversation: false,
    stepErrors: 0,
    isWaitingForOwner: false,
    hasWakeSinceStart: false,
    nextState: 'ready',
    retryAt: 1_030_000,
  },
  {
    name: 'a task on its last try',
    isConversation: false,
    stepErrors: 2,
    isWaitingForOwner: false,
    hasWakeSinceStart: false,
    nextState: 'failed',
    retryAt: 1_030_000,
  },
  {
    name: 'a task whose error waits for the owner',
    isConversation: false,
    stepErrors: 0,
    isWaitingForOwner: true,
    hasWakeSinceStart: false,
    nextState: 'ready',
    retryAt: 1_030_000,
  },
  {
    name: 'the conversation on its first error',
    isConversation: true,
    stepErrors: 0,
    isWaitingForOwner: false,
    hasWakeSinceStart: false,
    nextState: 'ready',
    retryAt: 1_030_000,
  },
  {
    name: 'the conversation on its second error in a row',
    isConversation: true,
    stepErrors: 1,
    isWaitingForOwner: false,
    hasWakeSinceStart: false,
    nextState: 'ready',
    retryAt: 1_060_000,
  },
  {
    name: 'the conversation past its error limit',
    isConversation: true,
    stepErrors: 2,
    isWaitingForOwner: false,
    hasWakeSinceStart: false,
    nextState: 'ready',
    retryAt: 1_120_000,
  },
  {
    name: 'the conversation whose error waits for the owner',
    isConversation: true,
    stepErrors: 0,
    isWaitingForOwner: true,
    hasWakeSinceStart: false,
    nextState: 'waiting',
    retryAt: 1_000_000,
  },
  {
    name: 'the conversation whose error waits for the owner after a message arrived',
    isConversation: true,
    stepErrors: 0,
    isWaitingForOwner: true,
    hasWakeSinceStart: true,
    nextState: 'ready',
    retryAt: 1_000_000,
  },
] as const)('it plans $name', (row) => {
  const plan = buildStepFailurePlan(
    {
      taskID: row.isConversation ? 'conversation' : 'tidy-inbox',
      stepKey: 'step:1',
      stepErrors: row.stepErrors,
      isConversation: row.isConversation,
      isPauseRequested: false,
      hasWakeSinceStart: row.hasWakeSinceStart,
      now: 1_000_000,
      definitions: { snapshotHash: 'sha256:test' },
    },
    new StepFailedError('the call failed', {
      reason: 'test',
      isWaitingForOwner: row.isWaitingForOwner,
      records: [],
    }),
    { maxStepErrors: 3, retryDelayMs: 30_000, maxRetryDelayMs: 300_000 },
  );

  expect({ nextState: plan.nextState, retryAt: plan.retryAt }).toStrictEqual({
    nextState: row.nextState,
    retryAt: row.retryAt,
  });
});

test("it writes a failed step's records on the task's thread before the error, with its reason", () => {
  const plan = buildStepFailurePlan(
    {
      taskID: 'conversation',
      stepKey: 'conversation:4',
      stepErrors: 0,
      isConversation: true,
      isPauseRequested: false,
      hasWakeSinceStart: false,
      now: 1_000_000,
      definitions: { snapshotHash: 'sha256:test' },
    },
    new StepFailedError('the weekly allowance is used up', {
      reason: 'quota',
      isWaitingForOwner: true,
      records: [
        {
          kind: 'turn_finished',
          definitions: { snapshotHash: 'sha256:test' },
          payload: { note: 'checked the tide table' },
        },
      ],
    }),
    { maxStepErrors: 3, retryDelayMs: 30_000, maxRetryDelayMs: 300_000 },
  );

  expect(plan).toStrictEqual({
    records: [
      {
        kind: 'turn_finished',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: { note: 'checked the tide table' },
      },
      {
        kind: 'task.step_errored',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: {
          taskID: 'conversation',
          stepKey: 'conversation:4',
          nextState: 'waiting',
          errors: 1,
          errorLimit: 3,
          reason: 'quota',
          claimableAt: 1_000_000,
        },
        erasable: { message: 'the weekly allowance is used up' },
      },
    ],
    errors: 1,
    nextState: 'waiting',
    retryAt: 1_000_000,
  });
});

test('it writes an error with no reason and no records for an error that is not a failed step', () => {
  const plan = buildStepFailurePlan(
    {
      taskID: 'tidy-inbox',
      stepKey: 'tidy-inbox:1',
      stepErrors: 0,
      isConversation: false,
      isPauseRequested: false,
      hasWakeSinceStart: false,
      now: 1_000_000,
      definitions: { snapshotHash: 'sha256:test' },
    },
    new Error('the model profile is unreachable'),
    { maxStepErrors: 3, retryDelayMs: 30_000, maxRetryDelayMs: 300_000 },
  );

  expect(plan.records).toStrictEqual([
    {
      kind: 'task.step_errored',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'tidy-inbox',
      payload: {
        taskID: 'tidy-inbox',
        stepKey: 'tidy-inbox:1',
        nextState: 'ready',
        errors: 1,
        errorLimit: 3,
        claimableAt: 1_030_000,
      },
      erasable: { message: 'the model profile is unreachable' },
    },
  ]);
});

test.each([
  ['ready', false, 0],
  ['waiting', true, 0],
] as const)(
  'it pauses a task whose pause waited on the step, to resume %s',
  (resumeState, isWaitingForOwner, stepErrors) => {
    const plan = buildStepFailurePlan(
      {
        taskID: 'conversation',
        stepKey: 'conversation:4',
        stepErrors,
        isConversation: true,
        isPauseRequested: true,
        hasWakeSinceStart: false,
        now: 1_000_000,
        definitions: { snapshotHash: 'sha256:test' },
      },
      new StepFailedError('the call failed', { reason: 'test', isWaitingForOwner, records: [] }),
      { maxStepErrors: 3, retryDelayMs: 30_000, maxRetryDelayMs: 300_000 },
    );

    expect(plan.records.at(-1)).toStrictEqual({
      kind: 'task.paused',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { taskID: 'conversation', resumeState },
    });
  },
);

test('it writes no pause for a task whose pause waited on the step that used its last try', () => {
  const plan = buildStepFailurePlan(
    {
      taskID: 'tidy-inbox',
      stepKey: 'tidy-inbox:3',
      stepErrors: 2,
      isConversation: false,
      isPauseRequested: true,
      hasWakeSinceStart: false,
      now: 1_000_000,
      definitions: { snapshotHash: 'sha256:test' },
    },
    new Error('the model profile is unreachable'),
    { maxStepErrors: 3, retryDelayMs: 30_000, maxRetryDelayMs: 300_000 },
  );

  expect(plan.records.map((record) => record.kind)).toStrictEqual(['task.step_errored']);
});
