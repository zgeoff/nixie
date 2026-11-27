import { expect, onTestFinished, test } from 'bun:test';
import { bodyFieldReaders } from '@heynixie/api';
import { fillBodyFieldReaders } from './fill-body-field-readers';

function setupTest() {
  onTestFinished(() => {
    bodyFieldReaders.set([]);
  });
}

test('it adds the Google reader of card fields when the google section is there', () => {
  setupTest();
  fillBodyFieldReaders({ google: {} });

  expect(bodyFieldReaders.list()).toHaveLength(1);
});

test('it adds the reader of a package install card when the devices section is there', () => {
  setupTest();
  fillBodyFieldReaders({ devices: {} });

  expect(bodyFieldReaders.list()).toHaveLength(1);
});

test('it holds both readers when both sections are there', () => {
  setupTest();
  fillBodyFieldReaders({ google: {}, devices: {} });

  expect(bodyFieldReaders.list()).toHaveLength(2);
});

test('it leaves no reader when both sections are absent', () => {
  setupTest();
  fillBodyFieldReaders({ google: {}, devices: {} });
  fillBodyFieldReaders({});

  expect(bodyFieldReaders.list()).toStrictEqual([]);
});
