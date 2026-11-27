import { expect, onTestFinished, test } from 'bun:test';
import { textSources } from '@heynixie/triggers';
import { fillPhoneLists } from './fill-phone-lists';

function setupTest() {
  onTestFinished(() => {
    textSources.set([]);
  });
}

test('it accepts the phone as a text source when the phone is on', () => {
  setupTest();
  fillPhoneLists({ phone: {} });

  expect(textSources.list()).toStrictEqual(['phone']);
});

test('it accepts no text source when the phone is off', () => {
  setupTest();
  fillPhoneLists({ phone: {} });
  fillPhoneLists({});

  expect(textSources.list()).toStrictEqual([]);
});
