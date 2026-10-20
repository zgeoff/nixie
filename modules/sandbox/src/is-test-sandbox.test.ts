import { expect, onTestFinished, test } from 'bun:test';
import { isTestSandbox } from './is-test-sandbox';

test('it reads the process double as the test sandbox in a test build', () => {
  expect(isTestSandbox({ id: 'process' })).toBeTrue();
});

test('it reads the imp adapter as no test sandbox', () => {
  expect(isTestSandbox({ id: 'imp' })).toBeFalse();
});

test('it reads no adapter as the test sandbox in a release build', () => {
  Object.assign(globalThis, { NIXIE_TEST_BUILD: false });

  onTestFinished(() => {
    Object.assign(globalThis, { NIXIE_TEST_BUILD: true });
  });

  expect(isTestSandbox({ id: 'process' })).toBeFalse();
});
