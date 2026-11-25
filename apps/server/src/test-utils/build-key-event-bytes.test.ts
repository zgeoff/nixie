import { expect, test } from 'bun:test';
import { buildKeyEventBytes } from './build-key-event-bytes';

test.each([
  ['a press of a Unicode keysym', 0x01_00_26_03, true, [4, 1, 0, 0, 1, 0, 38, 3]],
  ['a release of Return', 0xff_0d, false, [4, 0, 0, 0, 0, 0, 255, 13]],
])('it builds the KeyEvent bytes of %s', (_title, keysym, isDown, expected) => {
  expect([...buildKeyEventBytes(keysym, isDown)]).toStrictEqual(expected);
});
