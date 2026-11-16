import { expect, test } from 'bun:test';
import { buildMockDefinitionNotice } from './build-mock-definition-notice';

test('it builds the notice of an add that is in force', () => {
  expect(buildMockDefinitionNotice()).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    name: 'Water the tomatoes',
    operation: 'add',
    shortID: 'k3x9m2p7qa',
    changeID: expect.any(String),
    hasVersion: true,
    rendered: 'every Friday at 08:00',
    next: 'Fri 12 Mar',
    state: 'in_force',
    isUnreadable: false,
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockDefinitionNotice({ state: 'superseded', next: null })).toMatchObject({
    state: 'superseded',
    next: null,
  });
});
