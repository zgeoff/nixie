import { expect, test } from 'bun:test';
import { isOutboxMessageStale } from './is-outbox-message-stale';

test('it counts a message written 2 minutes ago or less as fresh', () => {
  expect(
    isOutboxMessageStale(
      {
        clientMessageId: '3d8e1f6a-9b2c-4a7d-8e5f-1c4b7a0d3e96',
        spans: [],
        text: 'Water the ferns.',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
      Date.parse('2026-10-17T09:02:00.000Z'),
    ),
  ).toBeFalse();
});

test('it counts a message written over 2 minutes ago as stale', () => {
  expect(
    isOutboxMessageStale(
      {
        clientMessageId: '3d8e1f6a-9b2c-4a7d-8e5f-1c4b7a0d3e96',
        spans: [],
        text: 'Water the ferns.',
        thread: 'conversation',
        writtenAt: '2026-10-17T09:00:00.000Z',
      },
      Date.parse('2026-10-17T09:02:00.001Z'),
    ),
  ).toBeTrue();
});

test('it counts a message with no written time as stale', () => {
  expect(
    isOutboxMessageStale(
      {
        clientMessageId: '3d8e1f6a-9b2c-4a7d-8e5f-1c4b7a0d3e96',
        spans: [],
        text: 'Water the ferns.',
        thread: 'conversation',
      },
      Date.parse('2026-10-17T09:00:00.000Z'),
    ),
  ).toBeTrue();
});
