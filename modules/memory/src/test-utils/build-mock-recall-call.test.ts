import { expect, test } from 'bun:test';
import { buildMockRecallCall } from './build-mock-recall-call';

test('it builds a finished call of the conversation and lets a field be replaced', () => {
  expect(buildMockRecallCall({ kind: 'ids' })).toStrictEqual({
    sequence: 5,
    thread: 'conversation',
    endSequence: 20,
    kind: 'ids',
  });
});
