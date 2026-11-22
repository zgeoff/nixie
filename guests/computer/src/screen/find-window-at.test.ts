import { expect, test } from 'bun:test';
import { findWindowAt } from './find-window-at';
import type { DesktopWindow } from './types';

function setupTest() {
  const back: DesktopWindow = { id: '0x1', kind: 'browser', x: 0, y: 0, width: 1280, height: 800 };

  const front: DesktopWindow = {
    id: '0x2',
    kind: 'terminal',
    x: 24,
    y: 24,
    width: 400,
    height: 300,
  };

  return { back, front };
}

test('it finds the topmost window that holds the point', () => {
  const ctx = setupTest();

  expect(findWindowAt([ctx.back, ctx.front], 100, 100)?.id).toBe('0x2');
});

test('it finds the window below when the point is outside the top one', () => {
  const ctx = setupTest();

  expect(findWindowAt([ctx.back, ctx.front], 800, 600)?.id).toBe('0x1');
});

test('it finds no window for a point outside every window', () => {
  const ctx = setupTest();

  expect(findWindowAt([ctx.front], 800, 600)).toBeNull();
});

test('it counts the left and top edges in a window and the right and bottom edges out', () => {
  const ctx = setupTest();

  expect([
    findWindowAt([ctx.front], 24, 24)?.id,
    findWindowAt([ctx.front], 424, 24)?.id,
    findWindowAt([ctx.front], 24, 324)?.id,
  ]).toStrictEqual(['0x2', undefined, undefined]);
});
