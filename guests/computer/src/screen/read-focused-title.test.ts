import { expect, test } from 'bun:test';
import { readFocusedTitle } from './read-focused-title';
import type { DesktopDriver, DesktopWindow } from './types';

function setupTest() {
  const windows: DesktopWindow[] = [
    { id: '0x1', kind: 'browser', x: 0, y: 0, width: 1280, height: 800 },
    { id: '0x3', kind: 'other', x: 300, y: 300, width: 200, height: 100 },
  ];

  const titles: Record<string, string> = { '0x1': 'Shop', '0x3': 'Save File' };

  const buildDriver = (
    activeID: string | null,
  ): Pick<DesktopDriver, 'readWindows' | 'readTitle'> => ({
    readWindows: () => Promise.resolve({ windows, activeID }),
    readTitle: (id) => Promise.resolve(titles[id] ?? ''),
  });

  return { buildDriver };
}

test('it reads the title of the window in focus', async () => {
  const ctx = setupTest();

  const title = await readFocusedTitle(ctx.buildDriver('0x3'));

  expect(title).toBe('Save File');
});

test('it reads no title when no window has focus', async () => {
  const ctx = setupTest();

  const title = await readFocusedTitle(ctx.buildDriver(null));

  expect(title).toBe('');
});

test('it cuts a title past 200 characters', async () => {
  const driver = {
    readWindows: () => Promise.resolve({ windows: [], activeID: '0x9' }),
    readTitle: () => Promise.resolve('a'.repeat(300)),
  };

  const title = await readFocusedTitle(driver);

  expect(title).toBe('a'.repeat(200));
});
