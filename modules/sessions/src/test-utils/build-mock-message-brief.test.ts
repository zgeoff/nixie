import { expect, test } from 'bun:test';
import { buildMockMessageBrief } from './build-mock-message-brief';

test('it builds the brief of a task that started on a brief message', () => {
  expect(buildMockMessageBrief()).toStrictEqual({
    origin: 'message',
    messageID: 'm7k2',
    from: 'conversation',
    sequence: 16_031,
    sentAt: new Date('2026-11-05T17:39:00Z'),
    body: 'Find 3 quiet cafes near the station.',
  });
});
