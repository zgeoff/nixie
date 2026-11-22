import { expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeXDriver } from './make-x-driver';

function setupTest() {
  const ran: string[] = [];

  const answers: Record<string, string> = {
    'xprop -root _NET_CLIENT_LIST_STACKING':
      '_NET_CLIENT_LIST_STACKING(WINDOW): window id # 0x200004, 0x400003, 0x500001',
    'xprop -root _NET_ACTIVE_WINDOW': '_NET_ACTIVE_WINDOW(WINDOW): window id # 0x400003',
    'xprop -id 0x200004 WM_CLASS': 'WM_CLASS(STRING) = "chromium", "Chromium"',
    'xprop -id 0x400003 WM_CLASS': 'WM_CLASS(STRING) = "xterm", "XTerm"',
    'xprop -id 0x500001 WM_CLASS': 'WM_CLASS(STRING) = "chromium", "Chromium"',
    'xwininfo -id 0x200004':
      'Absolute upper-left X: 0\nAbsolute upper-left Y: 0\nWidth: 1280\nHeight: 800\nMap State: IsViewable',
    'xwininfo -id 0x400003':
      'Absolute upper-left X: 24\nAbsolute upper-left Y: 24\nWidth: 700\nHeight: 500\nMap State: IsViewable',
    'xwininfo -id 0x500001':
      'Absolute upper-left X: 0\nAbsolute upper-left Y: 0\nWidth: 10\nHeight: 10\nMap State: IsUnMapped',
  };

  const driver = makeXDriver({
    shotPath: '',
    runTool: (argv) => {
      ran.push(argv.join(' '));

      return Promise.resolve(answers[argv.join(' ')] ?? '');
    },
  });

  return { ran, driver };
}

test('it reads the visible windows from bottom to top and the active one', async () => {
  const ctx = setupTest();

  const read = await ctx.driver.readWindows();

  expect(read).toStrictEqual({
    windows: [
      { id: '0x200004', kind: 'browser', x: 0, y: 0, width: 1280, height: 800 },
      { id: '0x400003', kind: 'terminal', x: 24, y: 24, width: 700, height: 500 },
    ],
    activeID: '0x400003',
  });
});

test('it reads the picture the screenshot tool wrote', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'x-driver-'));

  const shotPath = join(folder, 'shot.png');

  await writeFile(shotPath, 'picture');

  const ran: string[] = [];

  const driver = makeXDriver({
    shotPath,
    runTool: (argv) => {
      ran.push(argv.join(' '));

      return Promise.resolve('');
    },
  });

  const bytes = await driver.capture();

  const text = new TextDecoder().decode(bytes);

  expect([text, ran]).toStrictEqual(['picture', [`scrot -o -z ${shotPath}`]]);
});

test('it clicks through xdotool', async () => {
  const ctx = setupTest();

  await ctx.driver.click(412, 233, 'right');

  expect(ctx.ran).toStrictEqual(['xdotool mousemove 412 233 click 3']);
});
