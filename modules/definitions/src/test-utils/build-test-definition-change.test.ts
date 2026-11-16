import { expect, test } from 'bun:test';
import { buildTestDefinitionChange } from './build-test-definition-change';

test('it builds a change in force that replaced the repo version', () => {
  expect(buildTestDefinitionChange()).toStrictEqual({
    changeID: 'c1',
    shortID: 'k1',
    operation: 'change',
    hash: 'h-c1',
    previous: 'h-r',
    base: 'h-r',
    definitions: 'h-r',
    replaces: null,
    state: 'in_force',
    cause: null,
  });
});

test('it takes the fields that the caller overrides', () => {
  expect(buildTestDefinitionChange({ state: 'adopted', cause: 'seed' })).toMatchObject({
    state: 'adopted',
    cause: 'seed',
    changeID: 'c1',
  });
});
