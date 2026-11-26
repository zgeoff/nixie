import { expect, onTestFinished, test } from 'bun:test';
import { hasStoredScreen, readStoredScreen, writeStoredScreen } from './read-stored-screen';

test('#readStoredScreen starts a device with nothing stored on a screen that is off', () => {
  globalThis.localStorage.clear();

  expect(readStoredScreen()).toBeFalse();
});

test('#readStoredScreen reads the choice that #writeStoredScreen stored', () => {
  onTestFinished(() => {
    globalThis.localStorage.clear();
  });

  writeStoredScreen(true);

  expect(readStoredScreen()).toBeTrue();
});

test('#hasStoredScreen tells a device with nothing stored from one that stored off', () => {
  onTestFinished(() => {
    globalThis.localStorage.clear();
  });

  globalThis.localStorage.clear();

  const before = hasStoredScreen();

  writeStoredScreen(false);

  expect([before, hasStoredScreen()]).toStrictEqual([false, true]);
});
