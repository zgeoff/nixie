import { expect, test } from 'bun:test';
import { buildMockCheckerAnswer } from './build-mock-checker-answer';

test('it builds a default checker answer', () => {
  expect(buildMockCheckerAnswer()).toStrictEqual({
    verdict: 'asserted',
    reason: expect.toBeString(),
    model: expect.toStartWith('claude-'),
    failure: null,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockCheckerAnswer({ verdict: 'unsure', failure: 'timeout' })).toStrictEqual({
    verdict: 'unsure',
    reason: expect.toBeString(),
    model: expect.toStartWith('claude-'),
    failure: 'timeout',
  });
});
