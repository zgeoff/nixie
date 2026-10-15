import { expect, onTestFinished, test } from 'bun:test';
import { setupBrowserTimeZone } from './setup-browser-time-zone';

test('it sets the time zone the browser reports', () => {
  setupBrowserTimeZone('Pacific/Auckland');

  expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Pacific/Auckland');
});

test('it restores the run time zone once the test finishes', () => {
  const before = new Intl.DateTimeFormat().resolvedOptions().timeZone;

  setupBrowserTimeZone('Pacific/Auckland');

  onTestFinished(() => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(before);
  });

  expect(before).not.toBe('Pacific/Auckland');
});
