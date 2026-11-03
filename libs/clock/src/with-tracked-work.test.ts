import { expect, onTestFinished, test } from 'bun:test';
import { setWorkTracker } from './set-work-tracker';
import { withTrackedWork } from './with-tracked-work';

test('it runs the work itself when no tracker is installed', () => {
  expect(withTrackedWork(() => Promise.resolve('claimed'))).resolves.toBe('claimed');
});

test('it runs the work through the installed tracker', async () => {
  const tracked: string[] = [];

  setWorkTracker({
    runWork: (work) => {
      tracked.push('work');

      return work();
    },
  });

  onTestFinished(() => {
    setWorkTracker(null);
  });

  const result = await withTrackedWork(() => Promise.resolve('claimed'));

  expect({ result, tracked }).toStrictEqual({ result: 'claimed', tracked: ['work'] });
});
