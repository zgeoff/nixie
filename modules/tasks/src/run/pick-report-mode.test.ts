import { expect, test } from 'bun:test';
import { buildTestRunSettings } from '../test-utils/build-test-run-settings';
import { pickReportMode } from './pick-report-mode';

test.each([
  ['start', 'wake'],
  ['definition', 'next_turn'],
] as const)('it gives a %s with no mode the default %s', (from, expected) => {
  expect(pickReportMode(undefined, from, buildTestRunSettings())).toBe(expected);
});

test('it keeps the mode that a start names', () => {
  expect(pickReportMode('none', 'start', buildTestRunSettings())).toBe('none');
});
