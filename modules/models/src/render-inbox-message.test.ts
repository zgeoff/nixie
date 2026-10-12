import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderInboxMessage } from './render-inbox-message';

test('it renders your message as you wrote it', () => {
  expect(
    renderInboxMessage(
      buildMockLogRecord({
        kind: 'owner_message',
        erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
      }),
    ),
  ).toBe('Buy milk.');
});

test('it renders a note in place of a message whose text was forgotten', () => {
  expect(
    renderInboxMessage(
      buildMockLogRecord({ kind: 'owner_message', erasable: { status: 'shredded' } }),
    ),
  ).toBe('[a message you sent, since forgotten]');
});

test('it renders a fired timer', () => {
  expect(
    renderInboxMessage(
      buildMockLogRecord({
        kind: 'timer.fired',
        payload: { timerID: 't-1' },
        erasable: { status: 'none' },
      }),
    ),
  ).toBe('A timer fired: {"timerID":"t-1"}');
});

test('it renders an action outcome', () => {
  expect(
    renderInboxMessage(
      buildMockLogRecord({
        kind: 'action.outcome',
        payload: { actionID: 'a-1' },
        erasable: { status: 'none' },
      }),
    ),
  ).toBe('An action settled: {"actionID":"a-1"}');
});
