import { expect, test } from 'bun:test';
import { renderSinceBlock } from './render-since-block';

test('it renders both times as UTC to the millisecond on one line', () => {
  expect(
    renderSinceBlock(new Date('2026-11-05T17:39:12.345Z'), new Date('2026-11-12T17:39:10.001Z')),
  ).toBe(
    '<input name="since">Your previous run started at 2026-11-05T17:39:12.345Z. This run started at 2026-11-12T17:39:10.001Z. Read messages from the first time up to the second.</input>',
  );
});
