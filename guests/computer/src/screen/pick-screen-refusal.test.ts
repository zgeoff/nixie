import { expect, test } from 'bun:test';
import type { ScreenBinding } from '@heynixie/wire';
import { parseChord } from './parse-chord';
import { pickScreenRefusal } from './pick-screen-refusal';
import type { ScreenTarget } from './types';

function setupTest() {
  const browser: ScreenBinding = {
    windowID: '0x1',
    kind: 'browser',
    tab: 't1',
    url: 'https://pages.test/',
  };

  const browserTarget: ScreenTarget = { binding: browser, pageTop: 85 };

  return {
    browser,
    browserTarget,
    refuseChord: (keys: string) =>
      pickScreenRefusal(browserTarget, { kind: 'chord', chord: parseChord(keys) ?? [] }, browser),
  };
}

test.each([
  'ctrl+l',
  'alt+d',
  'f6',
  'ctrl+k',
  'ctrl+e',
  'ctrl+t',
  'ctrl+n',
  'ctrl+shift+n',
  'shift+ctrl+n',
  'CTRL+L',
])('it refuses the chord %s on a browser window with use_browser_open', (keys) => {
  const ctx = setupTest();

  expect(ctx.refuseChord(keys)).toMatchObject({ reason: 'use_browser_open' });
});

test.each(['enter', 'shift+tab', 'ctrl+a', 'f5'])(
  'it allows the chord %s on a browser window',
  (keys) => {
    const ctx = setupTest();

    expect(ctx.refuseChord(keys)).toBeNull();
  },
);

test('it refuses a click on the address bar with the browser_open message', () => {
  const ctx = setupTest();

  expect(pickScreenRefusal(ctx.browserTarget, { kind: 'click', y: 40 }, ctx.browser)).toStrictEqual(
    {
      kind: 'failed',
      ok: false,
      reason: 'use_browser_open',
      message: 'Use the computer.browser_open tool instead',
    },
  );
});

test('it allows a click on the page', () => {
  const ctx = setupTest();

  expect(pickScreenRefusal(ctx.browserTarget, { kind: 'click', y: 400 }, ctx.browser)).toBeNull();
});

test.each([
  { kind: 'click' as const, y: 10 },
  { kind: 'scroll' as const },
  { kind: 'text' as const },
])('it refuses a $kind on the terminal with the run message', (check) => {
  expect(
    pickScreenRefusal(
      { binding: { windowID: '0x2', kind: 'terminal' }, pageTop: null },
      check,
      null,
    ),
  ).toStrictEqual({
    kind: 'failed',
    ok: false,
    reason: 'use_run',
    message: 'Use the computer.run tool instead',
  });
});

test('it refuses with use_run when the browser was bound and the point is now on the terminal', () => {
  const ctx = setupTest();

  const refusal = pickScreenRefusal(
    { binding: { windowID: '0x2', kind: 'terminal' }, pageTop: null },
    { kind: 'click', y: 100 },
    ctx.browser,
  );

  expect(refusal).toMatchObject({ reason: 'use_run' });
});

test.each([
  ['a window of another ID', { windowID: '0x9' }],
  ['a tab that moved to another URL', { url: 'https://pages.test/other' }],
  ['another tab', { tab: 't2' }],
])('it refuses with screen_changed for %s', (_name, change) => {
  const ctx = setupTest();

  expect(
    pickScreenRefusal(
      { binding: { ...ctx.browser, ...change }, pageTop: 85 },
      { kind: 'click', y: 400 },
      ctx.browser,
    ),
  ).toMatchObject({ reason: 'screen_changed' });
});

test('it refuses with screen_changed when the point is on a window of another kind', () => {
  const ctx = setupTest();

  expect(
    pickScreenRefusal(
      { binding: { windowID: '0x7', kind: 'other' }, pageTop: null },
      { kind: 'click', y: 400 },
      ctx.browser,
    ),
  ).toMatchObject({ reason: 'screen_changed' });
});

test.each([{ kind: 'click', y: 400 }, { kind: 'scroll' }, { kind: 'text' }] as const)(
  'it refuses a %o on a browser window that shows no tracked tab with use_browser_open',
  (check) => {
    const target: ScreenTarget = { binding: { windowID: '0x9', kind: 'browser' }, pageTop: null };

    expect(pickScreenRefusal(target, check, null)).toMatchObject({ reason: 'use_browser_open' });
  },
);
