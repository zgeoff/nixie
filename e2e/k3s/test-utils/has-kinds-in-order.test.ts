import { expect, test } from 'bun:test';
import { hasKindsInOrder } from './has-kinds-in-order';

test('it holds when each kind appears in order with other records between', () => {
  expect(
    hasKindsInOrder(
      [
        { kind: 'owner_message' },
        { kind: 'model.reply' },
        { kind: 'tool_called' },
        { kind: 'tool_result' },
        { kind: 'model.reply' },
      ],
      ['owner_message', 'tool_called', 'tool_result', 'model.reply'],
    ),
  ).toBeTrue();
});

test('it fails when a kind is missing', () => {
  expect(
    hasKindsInOrder(
      [{ kind: 'owner_message' }, { kind: 'model.reply' }],
      ['owner_message', 'tool_called', 'model.reply'],
    ),
  ).toBeFalse();
});

test('it fails when 2 kinds appear out of order', () => {
  expect(
    hasKindsInOrder(
      [{ kind: 'owner_message' }, { kind: 'model.reply' }, { kind: 'tool_called' }],
      ['owner_message', 'tool_called', 'model.reply'],
    ),
  ).toBeFalse();
});
