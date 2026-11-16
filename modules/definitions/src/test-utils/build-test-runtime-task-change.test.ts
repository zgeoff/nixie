import { expect, test } from 'bun:test';
import { buildTestRuntimeTaskChange } from './build-test-runtime-task-change';

test('it builds a change over the repo version', () => {
  expect(buildTestRuntimeTaskChange()).toStrictEqual({
    changeID: 'c1',
    definitionID: 'water-the-tomatoes',
    hash: 'h-nixie',
    base: 'h-repo',
    definitions: 'h-repo',
  });
});

test('it takes the fields that the caller overrides', () => {
  expect(buildTestRuntimeTaskChange({ hash: null })).toMatchObject({ hash: null, base: 'h-repo' });
});
