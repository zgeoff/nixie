import { expect, onTestFinished, test } from 'bun:test';
import { readTakeOverRequest } from './read-take-over-request';
import { writeTakeOverRequest } from './write-take-over-request';

function setupTest() {
  onTestFinished(() => {
    globalThis.sessionStorage.clear();
  });
}

test('it reads no request when the banner wrote none, as on a direct visit', () => {
  setupTest();

  expect(readTakeOverRequest()).toBeFalse();
});

test('it reads the request the banner wrote', () => {
  setupTest();
  writeTakeOverRequest();

  expect(readTakeOverRequest()).toBeTrue();
});

test('it reads the request once, so a refresh starts no take-over', () => {
  setupTest();
  writeTakeOverRequest();
  readTakeOverRequest();

  expect(readTakeOverRequest()).toBeFalse();
});
