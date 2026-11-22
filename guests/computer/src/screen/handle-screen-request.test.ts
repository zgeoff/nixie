import { expect, test } from 'bun:test';
import type { ScreenBinding } from '@heynixie/wire';
import type { ScreenRequest } from './handle-screen-request';
import { handleScreenRequest } from './handle-screen-request';
import type { DesktopDriver, DesktopWindow, ScreenTabs } from './types';

function setupTest() {
  const inputs: string[] = [];
  const camera = { isBroken: false };

  const windows = {
    browser: { id: '0x1', kind: 'browser', x: 0, y: 0, width: 1280, height: 800 },
    terminal: { id: '0x2', kind: 'terminal', x: 800, y: 400, width: 400, height: 300 },
    dialog: { id: '0x3', kind: 'other', x: 300, y: 300, width: 200, height: 100 },
    popup: { id: '0x4', kind: 'browser', x: 300, y: 300, width: 200, height: 100 },
  } as const satisfies Record<string, DesktopWindow>;

  const bound: ScreenBinding = {
    windowID: '0x1',
    kind: 'browser',
    tab: 't1',
    url: 'https://pages.test/',
  };

  const desktop: { windows: DesktopWindow[]; activeID: string } = { windows: [], activeID: '' };

  const driver: DesktopDriver = {
    readWindows: () => Promise.resolve({ windows: desktop.windows, activeID: desktop.activeID }),
    capture: () =>
      camera.isBroken
        ? Promise.reject(new Error('the display did not answer'))
        : Promise.resolve(new TextEncoder().encode('png')),
    click: (x, y, button) => {
      inputs.push(`click ${String(x)},${String(y)} ${button}`);

      return Promise.resolve();
    },
    scroll: (x, y, steps) => {
      inputs.push(`scroll ${String(x)},${String(y)} ${String(steps)}`);

      return Promise.resolve();
    },
    typeText: (text) => {
      inputs.push(`type ${text}`);

      return Promise.resolve();
    },
    pressChord: (chord) => {
      inputs.push(`press ${chord.join('+')}`);

      return Promise.resolve();
    },
  };

  const tabs: ScreenTabs = new Map([
    [
      't1',
      {
        page: {
          url: () => 'https://pages.test/',
          evaluate: () =>
            Promise.resolve(
              JSON.stringify({
                isVisible: true,
                pageTop: 85,
                left: 0,
                top: 0,
                width: 1280,
                height: 800,
              }),
            ),
        },
      },
    ],
  ]);

  return {
    inputs,
    camera,
    windows,
    bound,
    desktop,
    send: (request: ScreenRequest) => handleScreenRequest({ driver, tabs, settleMs: 0 }, request),
  };
}

test('it takes the picture of the desktop with the focus and no watcher field', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({ op: 'desktopShot' });

  expect(reply).toStrictEqual({
    kind: 'desktop',
    ok: true,
    width: 1280,
    height: 800,
    focus: { kind: 'browser', tab: 't1', url: 'https://pages.test/' },
    base64: Buffer.from('png').toString('base64'),
  });
});

test('it reports the terminal as the focus when the terminal has it', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.terminal];
  ctx.desktop.activeID = '0x2';

  const reply = await ctx.send({ op: 'desktopShot' });

  expect(reply).toMatchObject({ focus: { kind: 'terminal' } });
});

test('it binds a click to the browser window and tab under the point, with the desktop beside it', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.terminal];
  ctx.desktop.activeID = '0x2';

  const reply = await ctx.send({
    op: 'screenBind',
    act: { kind: 'click', x: 100, y: 300, button: 'left' },
  });

  expect(reply).toStrictEqual({
    kind: 'screen-target',
    ok: true,
    target: ctx.bound,
    base64: Buffer.from('png').toString('base64'),
  });
});

test('it binds a type to the focused window, not the one under the pointer', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.dialog];
  ctx.desktop.activeID = '0x3';

  const reply = await ctx.send({ op: 'screenBind', act: { kind: 'text', text: 'hi' } });

  expect(reply).toStrictEqual({
    kind: 'screen-target',
    ok: true,
    target: { windowID: '0x3', kind: 'other' },
  });
});

test('it refuses with use_run when the browser is focused and the point is on the terminal', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.terminal];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'click', x: 900, y: 500, button: 'left' },
  });

  expect([reply, ctx.inputs]).toStrictEqual([
    {
      kind: 'failed',
      ok: false,
      reason: 'use_run',
      message: 'Use the computer.run tool instead',
    },
    [],
  ]);
});

test('it refuses with screen_changed when the point is on another window', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.dialog];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'click', x: 350, y: 350, button: 'left' },
  });

  expect([reply, ctx.inputs]).toMatchObject([{ kind: 'failed', reason: 'screen_changed' }, []]);
});

test('it refuses a type with screen_changed when focus moved to another window', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.dialog];
  ctx.desktop.activeID = '0x3';

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'text', text: 'hello' },
  });

  expect(reply).toMatchObject({ kind: 'failed', reason: 'screen_changed' });
});

test('it refuses a click on the address bar with use_browser_open', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'click', x: 400, y: 40, button: 'left' },
  });

  expect([reply, ctx.inputs]).toMatchObject([{ kind: 'failed', reason: 'use_browser_open' }, []]);
});

test('it refuses ctrl+l with use_browser_open before it presses anything', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'keys', keys: 'ctrl+l' },
  });

  expect([reply, ctx.inputs]).toMatchObject([{ kind: 'failed', reason: 'use_browser_open' }, []]);
});

test('it refuses keys that are not one chord', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({ op: 'screenBind', act: { kind: 'keys', keys: 'ctrl+shift' } });

  expect(reply).toMatchObject({ kind: 'failed', reason: 'bad_keys' });
});

test('it clicks the point and returns the picture with the focus', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'click', x: 412, y: 233, button: 'right' },
  });

  expect([reply, ctx.inputs]).toStrictEqual([
    {
      kind: 'screen',
      ok: true,
      focus: { kind: 'browser', tab: 't1', url: 'https://pages.test/' },
      base64: Buffer.from('png').toString('base64'),
    },
    ['click 412,233 right'],
  ]);
});

test('it presses an allowed chord', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';

  await ctx.send({ op: 'screenAct', binding: ctx.bound, act: { kind: 'keys', keys: 'shift+tab' } });

  expect(ctx.inputs).toStrictEqual(['press shift+tab']);
});

test('it scrolls the window under the point', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';

  await ctx.send({ op: 'screenScroll', x: 640, y: 400, by: -3 });

  expect(ctx.inputs).toStrictEqual(['scroll 640,400 -3']);
});

test('it refuses a scroll over the terminal with use_run', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.terminal];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({ op: 'screenScroll', x: 900, y: 500, by: 2 });

  expect(reply).toMatchObject({
    kind: 'failed',
    reason: 'use_run',
  });
});

test('it refuses a click on a second browser window that shows no tracked tab', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.popup];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({
    op: 'screenBind',
    act: { kind: 'click', x: 400, y: 320, button: 'left' },
  });

  expect(reply).toMatchObject({ kind: 'failed', reason: 'use_browser_open' });
});

test('it refuses a bound click with screen_changed when an untracked browser window is now under the point', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser, ctx.windows.popup];
  ctx.desktop.activeID = '0x1';

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'click', x: 400, y: 320, button: 'left' },
  });

  expect([reply, ctx.inputs]).toMatchObject([{ kind: 'failed', reason: 'screen_changed' }, []]);
});

test('it reports a click done with no picture when the desktop cannot be captured after it', async () => {
  const ctx = setupTest();

  ctx.desktop.windows = [ctx.windows.browser];
  ctx.desktop.activeID = '0x1';
  ctx.camera.isBroken = true;

  const reply = await ctx.send({
    op: 'screenAct',
    binding: ctx.bound,
    act: { kind: 'click', x: 412, y: 233, button: 'left' },
  });

  expect([reply, ctx.inputs]).toStrictEqual([
    {
      kind: 'screen',
      ok: true,
      focus: { kind: 'browser', tab: 't1', url: 'https://pages.test/' },
    },
    ['click 412,233 left'],
  ]);
});
