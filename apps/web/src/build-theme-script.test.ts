import { expect, test } from 'bun:test';
import { buildThemeScript } from './build-theme-script';
import { runHeadScript } from './test-utils/run-head-script';
import { updateSystemColorScheme } from './test-utils/update-system-color-scheme';
import { themeStorageKey } from './theme-storage-key';

test.each([
  ['light', 'light'],
  ['dark', 'dark'],
] as const)('it follows a %s system when the device stores no choice', (system, expected) => {
  updateSystemColorScheme(system);
  runHeadScript(buildThemeScript());

  expect(globalThis.document.documentElement.dataset['theme']).toBe(expected);
});

test.each([
  ['light', 'dark', 'light'],
  ['dark', 'light', 'dark'],
  ['sepia', 'dark', 'dark'],
] as const)(
  'it sets a stored %s choice on a %s system to the %s theme',
  (stored, system, expected) => {
    globalThis.localStorage.setItem(themeStorageKey, stored);

    updateSystemColorScheme(system);
    runHeadScript(buildThemeScript());

    expect(globalThis.document.documentElement.dataset['theme']).toBe(expected);
  },
);
