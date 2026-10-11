import { expect, onTestFinished, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { setFaultPointHandler } from './set-fault-point-handler';
import { waitAtFaultPoint } from './wait-at-fault-point';

test('it returns at once when no handler is installed', async () => {
  const waiting = waitAtFaultPoint('claim.after', { kind: 'task', id: 'task-1' });

  await waiting;

  expect(waiting).resolves.toBeUndefined();
});

test('it holds the caller until the handler releases it', async () => {
  const release = Promise.withResolvers<void>();
  const progress: { arrived: string[]; passed: boolean } = { arrived: [], passed: false };

  setFaultPointHandler(async (id) => {
    progress.arrived.push(id);
    await release.promise;
  });
  onTestFinished(() => {
    setFaultPointHandler(null);
  });

  const waiting = (async () => {
    await waitAtFaultPoint('step.commit.before', { kind: 'task', id: 'task-1' });
    progress.passed = true;
  })();

  const heldBeforeRelease = await waitForCondition(() => progress.arrived.length === 1).then(
    () => !progress.passed,
  );

  release.resolve();
  await waiting;

  expect(heldBeforeRelease).toBeTrue();
  expect(progress.passed).toBeTrue();
});
