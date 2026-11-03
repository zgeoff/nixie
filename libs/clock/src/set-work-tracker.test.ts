import { expect, onTestFinished, test } from 'bun:test';
import { setWorkTracker } from './set-work-tracker';
import { withTrackedWork } from './with-tracked-work';

test('it refuses a tracker outside a test build', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  expect(() => {
    setWorkTracker({ runWork: (work) => work() });
  }).toThrowWithMessage(Error, 'a work tracker exists only in a test build');
});

test('it installs a tracker that tracked work then runs through in a test build', async () => {
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

  await withTrackedWork(() => Promise.resolve('claimed'));

  expect(tracked).toStrictEqual(['work']);
});
