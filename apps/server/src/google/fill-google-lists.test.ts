import { expect, onTestFinished, test } from 'bun:test';
import { bodyFieldReaders } from '@heynixie/api';
import { fillGoogleLists } from './fill-google-lists';

function setupTest() {
  onTestFinished(() => {
    bodyFieldReaders.set([]);
  });
}

test('it adds the Google reader of card fields to the API when the google section is there', () => {
  setupTest();
  fillGoogleLists({ google: {} });

  expect(bodyFieldReaders.list()).toHaveLength(1);
});

test('it leaves the API with no reader of Google card fields when the google section is absent', () => {
  setupTest();
  fillGoogleLists({ google: {} });
  fillGoogleLists({});

  expect(bodyFieldReaders.list()).toStrictEqual([]);
});
