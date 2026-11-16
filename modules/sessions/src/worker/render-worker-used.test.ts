import { expect, test } from 'bun:test';
import { renderWorkerUsed } from './render-worker-used';

test('it renders the minutes to a decimal place, the counts whole and the dollars to cents', () => {
  expect(renderWorkerUsed({ minutes: 0.4, turns: 3, tokens: 18_250, dollars: 0.06 })).toBe(
    'It used 0.4 minutes, 3 turns, 18250 tokens and $0.06.',
  );
});
