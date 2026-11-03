import { expect, onTestFinished, test } from 'bun:test';
import { setWorkTracker } from './set-work-tracker';

test('it refuses a tracker outside a test build', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  expect(() => {
    setWorkTracker({ runWork: (work) => work() });
  }).toThrowWithMessage(Error, 'a work tracker exists only in a test build');
});

test('it installs a tracker in a test build', () => {
  onTestFinished(() => {
    setWorkTracker(null);
  });

  expect(() => {
    setWorkTracker({ runWork: (work) => work() });
  }).not.toThrow();
});
