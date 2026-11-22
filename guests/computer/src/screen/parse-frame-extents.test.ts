import { expect, test } from 'bun:test';
import { parseFrameExtents } from './parse-frame-extents';

test('it reads the frame width on each side', () => {
  expect(parseFrameExtents('_NET_FRAME_EXTENTS(CARDINAL) = 1, 2, 20, 3')).toStrictEqual({
    left: 1,
    right: 2,
    top: 20,
    bottom: 3,
  });
});

test('it reads no frame from an unset property', () => {
  expect(parseFrameExtents('_NET_FRAME_EXTENTS:  not found.')).toStrictEqual({
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
});
