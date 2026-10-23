import { expect, test } from 'bun:test';
import { requireCheckerSnapshot } from './require-checker-snapshot';
import { StaleCheckerError } from './stale-checker-error';

test('it accepts checks whose checker ran under the definitions in force', () => {
  expect(() =>
    requireCheckerSnapshot(
      { definitions: () => ({ snapshotHash: 'sha256:current' }) },
      { quote: 'pass', checker: { verdict: 'asserted', snapshotHash: 'sha256:current' } },
    ),
  ).not.toThrow();
});

test('it accepts checks that no checker produced', () => {
  expect(() =>
    requireCheckerSnapshot(
      { definitions: () => ({ snapshotHash: 'sha256:current' }) },
      { rule: { id: 'rule-1', revision: 2 } },
    ),
  ).not.toThrow();
});

test('it refuses checks whose checker ran under other definitions', () => {
  expect(() =>
    requireCheckerSnapshot(
      { definitions: () => ({ snapshotHash: 'sha256:current' }) },
      { quote: 'pass', checker: { verdict: 'asserted', snapshotHash: 'sha256:earlier' } },
    ),
  ).toThrow(StaleCheckerError);
});
