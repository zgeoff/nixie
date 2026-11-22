import { expect, test } from 'bun:test';
import { parseWindowGeometry } from './parse-window-geometry';

test('it reads the geometry and the map state of a window', () => {
  const output = [
    'xwininfo: Window id: 0x400003 "terminal"',
    '  Absolute upper-left X:  24',
    '  Absolute upper-left Y:  -3',
    '  Width: 724',
    '  Height: 520',
    '  Map State: IsViewable',
  ].join('\n');

  expect(parseWindowGeometry(output)).toStrictEqual({
    x: 24,
    y: -3,
    width: 724,
    height: 520,
    isViewable: true,
  });
});

test('it reads no geometry from output that lacks a size', () => {
  expect(parseWindowGeometry('xwininfo: error')).toBeNull();
});
