import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderOwnerText } from './render-owner-text';

test('it renders your message as you wrote it', () => {
  expect(
    renderOwnerText(
      buildMockLogRecord({
        kind: 'owner_message',
        erasable: { status: 'readable', fields: { text: 'Buy milk.' } },
      }),
    ),
  ).toBe('Buy milk.');
});

test('it renders a note in place of a message whose text was forgotten', () => {
  expect(
    renderOwnerText(
      buildMockLogRecord({ kind: 'owner_message', erasable: { status: 'shredded' } }),
    ),
  ).toBe('[a message you sent, since forgotten]');
});
