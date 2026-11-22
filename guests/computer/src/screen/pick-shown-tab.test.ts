import { expect, test } from 'bun:test';
import type { ReadTab } from './pick-shown-tab';
import { pickShownTab } from './pick-shown-tab';
import type { DesktopWindow } from './types';

function setupTest() {
  const left: DesktopWindow = { id: '0x1', kind: 'browser', x: 0, y: 0, width: 600, height: 800 };

  const right: DesktopWindow = {
    id: '0x2',
    kind: 'browser',
    x: 640,
    y: 0,
    width: 600,
    height: 800,
  };

  const leftTab: ReadTab = {
    id: 't1',
    url: 'https://left.test/',
    isVisible: true,
    pageTop: 85,
    left: 0,
    top: 0,
    width: 600,
    height: 800,
  };

  return { left, right, leftTab, rightTab: { ...leftTab, id: 't2', left: 640 } };
}

test('it picks the last visible tab when the display has one browser window', () => {
  const ctx = setupTest();
  const hidden = { ...ctx.rightTab, isVisible: false };

  expect(pickShownTab(ctx.left, [ctx.left], [ctx.leftTab, ctx.rightTab, hidden])).toBe(
    ctx.rightTab,
  );
});

test('it gives each of 2 browser windows the tab that sits on it', () => {
  const ctx = setupTest();
  const windows = [ctx.left, ctx.right];
  const tabs = [ctx.leftTab, ctx.rightTab];

  expect([
    pickShownTab(ctx.left, windows, tabs),
    pickShownTab(ctx.right, windows, tabs),
  ]).toStrictEqual([ctx.leftTab, ctx.rightTab]);
});

test('it gives a browser window with no tab on it none, though another window has a tab', () => {
  const ctx = setupTest();

  expect(pickShownTab(ctx.right, [ctx.left, ctx.right], [ctx.leftTab])).toBeNull();
});

test('it gives none when 2 browser windows are equally near the tab', () => {
  const ctx = setupTest();
  const twin = { ...ctx.left, id: '0x3' };

  expect(pickShownTab(ctx.left, [ctx.left, twin], [ctx.leftTab])).toBeNull();
});

test('it gives none when the browser window shows no tracked tab', () => {
  const ctx = setupTest();

  expect(pickShownTab(ctx.left, [ctx.left], [])).toBeNull();
});

test('it gives none to a browser window that sits far from where the tab reports its window', () => {
  const ctx = setupTest();
  const moved = { ...ctx.leftTab, left: 200 };
  const untracked = { ...ctx.right, x: 340 };

  expect([
    pickShownTab(ctx.left, [ctx.left, untracked], [moved]),
    pickShownTab(untracked, [ctx.left, untracked], [moved]),
  ]).toStrictEqual([null, null]);
});
