import { expect, test } from 'bun:test';
import { parseFrameMessage } from './parse-frame-message';

test('#parseFrameMessage reads an event with its data and wake', () => {
  expect(
    parseFrameMessage({ nixie: true, type: 'event', name: 'touched', data: { x: 1 }, wake: true }),
  ).toStrictEqual({
    status: 'message',
    message: { type: 'event', name: 'touched', data: { x: 1 }, wake: true },
  });
});

test('#parseFrameMessage reads an event with no data', () => {
  expect(
    parseFrameMessage({ nixie: true, type: 'event', name: 'touched', wake: false }),
  ).toStrictEqual({
    status: 'message',
    message: { type: 'event', name: 'touched', data: undefined, wake: false },
  });
});

test('#parseFrameMessage reads ready and error messages', () => {
  expect([
    parseFrameMessage({ nixie: true, type: 'ready' }),
    parseFrameMessage({ nixie: true, type: 'error', message: 'boom' }),
  ]).toStrictEqual([
    { status: 'message', message: { type: 'ready' } },
    { status: 'message', message: { type: 'error', message: 'boom' } },
  ]);
});

test.each([
  { title: 'text', raw: 'hello' },
  { title: 'null', raw: null },
  { title: 'an object that is not marked as the bridge', raw: { type: 'ready' } },
  { title: 'an unknown type', raw: { nixie: true, type: 'navigate', url: 'https://evil.test' } },
])('#parseFrameMessage ignores $title', (row) => {
  expect(parseFrameMessage(row.raw)).toStrictEqual({ status: 'ignored' });
});

test('#parseFrameMessage refuses an event with a name past 64 characters', () => {
  expect(
    parseFrameMessage({ nixie: true, type: 'event', name: 'x'.repeat(65), wake: false }),
  ).toMatchObject({ status: 'refused' });
});

test('#parseFrameMessage refuses an event with data past 2 KiB', () => {
  expect(
    parseFrameMessage({
      nixie: true,
      type: 'event',
      name: 'touched',
      data: 'x'.repeat(2048),
      wake: false,
    }),
  ).toStrictEqual({ status: 'refused', reason: 'nixie.send data is over 2 KiB' });
});
