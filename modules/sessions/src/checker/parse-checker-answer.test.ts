import { expect, test } from 'bun:test';
import { parseCheckerAnswer } from './parse-checker-answer';

test('it reads a verdict and its reason with the model that gave them', () => {
  expect(
    parseCheckerAnswer({ verdict: 'not_asserted', reason: 'It is a question.' }, 'claude-test-1'),
  ).toStrictEqual({
    verdict: 'not_asserted',
    reason: 'It is a question.',
    model: 'claude-test-1',
    failure: null,
  });
});

test('it reads an answer with an unknown verdict as unsure and unreadable', () => {
  expect(
    parseCheckerAnswer({ verdict: 'probably', reason: 'It seems so.' }, 'claude-test-1'),
  ).toStrictEqual({
    verdict: 'unsure',
    reason: 'the answer was unreadable',
    model: 'claude-test-1',
    failure: 'unreadable',
  });
});

test('it reads an answer with no reason as unsure and unreadable', () => {
  expect(parseCheckerAnswer({ verdict: 'asserted' }, 'claude-test-1')).toStrictEqual({
    verdict: 'unsure',
    reason: 'the answer was unreadable',
    model: 'claude-test-1',
    failure: 'unreadable',
  });
});
