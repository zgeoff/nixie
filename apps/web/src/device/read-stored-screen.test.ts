import { expect, onTestFinished, test } from 'bun:test';
import { readStoredScreen, writeStoredScreen } from './read-stored-screen';

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
