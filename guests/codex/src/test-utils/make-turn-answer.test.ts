import { expect, test } from 'bun:test';
import { makeTurnAnswer } from './make-turn-answer';

test.each([
  { method: 'thread/start', expected: { result: { thread: { id: 'thread-1' } } } },
  {
    method: 'turn/start',
    expected: {
      result: { turn: { id: 'turn-1' } },
      after: [{ method: 'turn/started', params: {} }],
    },
  },
  { method: 'turn/interrupt', expected: {} },
])('it answers $method', (row) => {
  const answer = makeTurnAnswer([{ method: 'turn/started', params: {} }]);

  expect(answer({ method: row.method, params: null })).toStrictEqual(row.expected);
});
