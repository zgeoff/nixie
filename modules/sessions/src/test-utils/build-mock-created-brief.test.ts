import { expect, test } from 'bun:test';
import { buildMockCreatedBrief } from './build-mock-created-brief';

test('it builds the brief of a task that started on the release before briefs were messages', () => {
  expect(buildMockCreatedBrief()).toStrictEqual({
    origin: 'created',
    taskID: 't4m2',
    from: 'conversation',
    sequence: 400,
    sentAt: new Date('2026-11-05T17:39:00Z'),
    body: 'Find 3 quiet cafes near the station.',
  });
});
