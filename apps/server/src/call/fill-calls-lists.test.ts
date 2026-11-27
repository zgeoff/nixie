import { expect, onTestFinished, test } from 'bun:test';
import { definitionSections } from '@heynixie/definitions';
import { fillCallsLists } from './fill-calls-lists';

function setupTest() {
  onTestFinished(() => {
    definitionSections.set([]);
  });
}

test('it adds the voice folder to the sections of the definitions when the voice section is there', () => {
  setupTest();
  fillCallsLists({ voice: {} });

  expect(definitionSections.list().map((section) => section.folder)).toStrictEqual(['voice']);
});

test('it leaves the definitions with no voice folder when the voice section is absent', () => {
  setupTest();
  fillCallsLists({ voice: {} });
  fillCallsLists({});

  expect(definitionSections.list()).toStrictEqual([]);
});
