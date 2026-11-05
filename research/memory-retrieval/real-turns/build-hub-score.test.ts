import { expect, test } from 'bun:test';
import { buildHubScore } from './build-hub-score.ts';

test('it averages the nearest background similarities', () => {
  expect(buildHubScore([0.1, 0.5, 0.3, 0.7], 2)).toBeCloseTo(0.6);
});

test('it averages every similarity when the background holds fewer than the nearest count', () => {
  expect(buildHubScore([0.2, 0.4], 10)).toBeCloseTo(0.3);
});

test('it scores an empty background as 0', () => {
  expect(buildHubScore([], 10)).toBe(0);
});
