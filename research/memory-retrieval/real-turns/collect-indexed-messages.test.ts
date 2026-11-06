import { expect, test } from 'bun:test';
import { collectIndexedMessages } from './collect-indexed-messages.ts';

test('it keeps the typed text of each readable user message, and skips other records', () => {
  const record = (sequence: number, kind: string, erasable: { status: 'readable'; fields: Record<string, unknown> } | { status: 'shredded' }) => ({
    sequence,
    recordedAt: '2026-03-02T09:00:00Z',
    kind,
    thread: 'conversation',
    parent: null,
    payload: {},
    erasable,
  });

  expect(
    collectIndexedMessages([
      record(3, 'owner_message', {
        status: 'readable',
        fields: {
          text: 'see LOG please',
          spans: [
            { start: 0, end: 4, source: 'typed' },
            { start: 4, end: 7, source: 'pasted' },
            { start: 7, end: 14, source: 'typed' },
          ],
        },
      }),
      record(4, 'model.reply', { status: 'readable', fields: { text: 'Seen.' } }),
      record(5, 'owner_message', { status: 'shredded' }),
      record(6, 'owner_message', { status: 'readable', fields: { text: 'a'.repeat(1200) } }),
    ]),
  ).toStrictEqual(
    new Map([
      [3, 'see \n please'],
      [6, 'a'.repeat(1200)],
    ]),
  );
});
