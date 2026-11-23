import { expect, onTestFinished, test } from 'bun:test';
import { takeOverRequestKey } from './constants';
import { writeTakeOverRequest } from './write-take-over-request';

test('it marks a take-over request in the session storage of the tab', () => {
  onTestFinished(() => {
    globalThis.sessionStorage.clear();
  });

  writeTakeOverRequest();

  expect(globalThis.sessionStorage.getItem(takeOverRequestKey)).toBe('on');
});
