import { expect, test } from 'bun:test';
import { pickPixelsToSend } from './pick-pixels-to-send';

test.each([
  ['the size the server has', { width: 800, height: 600 }, null],
  ['a new width', { width: 900, height: 600 }, { width: 900, height: 600 }],
  ['a new height', { width: 800, height: 700 }, { width: 800, height: 700 }],
])('#pickPixelsToSend answers %s', (_name, current, expected) => {
  expect(pickPixelsToSend({ width: 800, height: 600 }, current)).toStrictEqual(expected);
});
