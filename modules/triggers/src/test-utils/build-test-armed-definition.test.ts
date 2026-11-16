import { expect, test } from 'bun:test';
import { buildTestArmedDefinition } from './build-test-armed-definition';

test('it builds a daily definition and applies the overrides', () => {
  const definition = buildTestArmedDefinition({ target: 'conversation' });

  expect(definition).toStrictEqual({
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    source: 'schedule',
    target: 'conversation',
    trigger: { schedule: { every: 'day', at: '08:00', zone: 'Australia/Sydney', catchUp: 'once' } },
  });
});
