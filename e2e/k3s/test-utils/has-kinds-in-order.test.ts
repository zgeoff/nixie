import { expect, test } from 'bun:test';
import { hasKindsInOrder } from './has-kinds-in-order';

test('it holds when each kind appears in order with other records between', () => {
  expect(
    hasKindsInOrder(
      [
        { kind: 'owner_message', recordedAt: new Date(0), sequence: 1, thread: 'conversation' },
        { kind: 'model.reply', recordedAt: new Date(0), sequence: 2, thread: 'conversation' },
        { kind: 'tool_called', recordedAt: new Date(0), sequence: 3, thread: 'conversation' },
        { kind: 'tool_result', recordedAt: new Date(0), sequence: 4, thread: 'conversation' },
        { kind: 'model.reply', recordedAt: new Date(0), sequence: 5, thread: 'conversation' },
      ],
      ['owner_message', 'tool_called', 'tool_result', 'model.reply'],
    ),
  ).toBeTrue();
});

test('it fails when a kind is missing', () => {
  expect(
    hasKindsInOrder(
      [
        { kind: 'owner_message', recordedAt: new Date(0), sequence: 1, thread: 'conversation' },
        { kind: 'model.reply', recordedAt: new Date(0), sequence: 2, thread: 'conversation' },
      ],
      ['owner_message', 'tool_called', 'model.reply'],
    ),
  ).toBeFalse();
});

test('it fails when 2 kinds appear out of order', () => {
  expect(
    hasKindsInOrder(
      [
        { kind: 'owner_message', recordedAt: new Date(0), sequence: 1, thread: 'conversation' },
        { kind: 'model.reply', recordedAt: new Date(0), sequence: 2, thread: 'conversation' },
        { kind: 'tool_called', recordedAt: new Date(0), sequence: 3, thread: 'conversation' },
      ],
      ['owner_message', 'tool_called', 'model.reply'],
    ),
  ).toBeFalse();
});
