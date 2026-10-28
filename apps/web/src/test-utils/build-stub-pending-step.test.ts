import { expect, test } from 'bun:test';
import { buildStubPendingStep } from './build-stub-pending-step';

test('it marks the step as started once it runs', async () => {
  const step = buildStubPendingStep();

  const startedBeforeRun = await Promise.race([
    step.started.then(() => true),
    Promise.resolve().then(() => false),
  ]);

  void step.run();
  expect(startedBeforeRun).toBe(false);
  expect(step.started).resolves.toBeUndefined();
});

test('it keeps the step running until the test finishes it', async () => {
  const step = buildStubPendingStep();
  const running = step.run();

  const finishedEarly = await Promise.race([
    running.then(() => true),
    Promise.resolve().then(() => false),
  ]);

  step.finish();

  expect(finishedEarly).toBe(false);
  expect(running).resolves.toBeUndefined();
});
