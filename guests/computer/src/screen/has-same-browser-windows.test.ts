import { expect, test } from 'bun:test';
import { hasSameBrowserWindows } from './has-same-browser-windows';
import type { DesktopWindow } from './types';

function setupTest() {
  const browser: DesktopWindow = {
    id: '0x1',
    kind: 'browser',
    x: 0,
    y: 0,
    width: 600,
    height: 800,
  };

  const terminal: DesktopWindow = {
    id: '0x2',
    kind: 'terminal',
    x: 640,
    y: 0,
    width: 600,
    height: 800,
  };

  return { browser, terminal };
}

test('it holds when the browser windows stay put and only a terminal moves', () => {
  const ctx = setupTest();

  expect(
    hasSameBrowserWindows([ctx.browser, ctx.terminal], [ctx.browser, { ...ctx.terminal, x: 10 }]),
  ).toBeTrue();
});

test.each([
  ['moved', [{ id: '0x1', kind: 'browser', x: 20, y: 0, width: 600, height: 800 }]],
  ['resized', [{ id: '0x1', kind: 'browser', x: 0, y: 0, width: 640, height: 800 }]],
  ['closed', []],
  [
    'joined by another',
    [
      { id: '0x1', kind: 'browser', x: 0, y: 0, width: 600, height: 800 },
      { id: '0x3', kind: 'browser', x: 640, y: 0, width: 600, height: 800 },
    ],
  ],
] satisfies [string, DesktopWindow[]][])(
  'it fails when a browser window was %s between the scans',
  (_, after) => {
    const ctx = setupTest();

    expect(hasSameBrowserWindows([ctx.browser], after)).toBeFalse();
  },
);
