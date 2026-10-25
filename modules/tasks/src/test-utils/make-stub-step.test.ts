import { expect, mock, test } from 'bun:test';
import { createTestClaim } from './create-test-claim';
import { makeStubStep } from './make-stub-step';
import { startTestTasks } from './start-test-tasks';

test('it runs its act on the step and then waits with the whole inbox read', async () => {
  const ctx = await startTestTasks();
  const claim = await createTestClaim(ctx.context, 'tidy the shed');

  const act = mock(() => Promise.resolve());

  const input = {
    taskID: claim.lease.workID,
    stepKey: claim.stepKey,
    lease: claim.lease,
    inbox: [],
    wake: claim.wake,
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  const result = await makeStubStep(act)(input);

  expect(act).toHaveBeenCalledExactlyOnceWith(input);
  expect(result).toStrictEqual({ next: 'wait', records: [], acknowledged: [] });
});
