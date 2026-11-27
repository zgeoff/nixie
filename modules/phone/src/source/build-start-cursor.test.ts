import { expect, test } from 'bun:test';
import { buildStartCursor } from './build-start-cursor';

test('#buildStartCursor stands at the newest text, skips each text at that time and sets the floor there', () => {
  const cursor = buildStartCursor([
    { messageID: 'a', from: 'X', receivedAt: 2000, precisionMs: 1, body: '' },
    { messageID: 'b', from: 'X', receivedAt: 2000, precisionMs: 1, body: '' },
    { messageID: 'c', from: 'X', receivedAt: 1000, precisionMs: 1, body: '' },
  ]);

  expect(cursor).toStrictEqual({ since: 2000, skip: ['a', 'b'], floor: 2000 });
});

test('#buildStartCursor takes every later text as new when the provider holds none', () => {
  expect(buildStartCursor([])).toStrictEqual({ since: 0, skip: [], floor: 0 });
});
