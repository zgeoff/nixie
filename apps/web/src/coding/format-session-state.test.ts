import { expect, test } from 'bun:test';
import { formatSessionState } from './format-session-state';

test.each([
  ['running', 'Running'],
  ['waiting', 'Waiting for you'],
  ['idle', 'Idle'],
  ['ended', 'Ended'],
  ['gone', 'Out of reach'],
] as const)('#formatSessionState words the state %s as %s', (state, label) => {
  expect(formatSessionState(state)).toBe(label);
});
