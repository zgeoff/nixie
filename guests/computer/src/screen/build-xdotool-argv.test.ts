import { expect, test } from 'bun:test';
import { buildXdotoolArgv } from './build-xdotool-argv';

test.each([
  ['left', '1'],
  ['right', '3'],
] as const)('it clicks the %s button as button %s', (button, number) => {
  expect(buildXdotoolArgv({ kind: 'click', x: 412, y: 233, button })).toStrictEqual([
    'xdotool',
    'mousemove',
    '412',
    '233',
    'click',
    number,
  ]);
});

test.each([
  [5, '5'],
  [-3, '4'],
])('it turns the wheel %i steps with button %s', (steps, button) => {
  expect(buildXdotoolArgv({ kind: 'scroll', x: 640, y: 400, steps })).toStrictEqual([
    'xdotool',
    'mousemove',
    '640',
    '400',
    'click',
    '--repeat',
    String(Math.abs(steps)),
    '--delay',
    '20',
    button,
  ]);
});

test('it passes text after a double dash so a leading dash is text', () => {
  expect(buildXdotoolArgv({ kind: 'type', text: '-rf' })).toStrictEqual([
    'xdotool',
    'type',
    '--clearmodifiers',
    '--delay',
    '12',
    '--',
    '-rf',
  ]);
});

test('it presses a chord by its xdotool name', () => {
  expect(buildXdotoolArgv({ kind: 'key', chord: ['ctrl', 'a'] })).toStrictEqual([
    'xdotool',
    'key',
    '--clearmodifiers',
    '--',
    'ctrl+a',
  ]);
});
