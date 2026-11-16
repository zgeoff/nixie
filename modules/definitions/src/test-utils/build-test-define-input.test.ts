import { expect, test } from 'bun:test';
import { buildTestDefineInput } from './build-test-define-input';

test('it builds the weekly reminder of the tomatoes', () => {
  expect(buildTestDefineInput()).toStrictEqual({
    name: 'Water the tomatoes',
    brief: 'Water the tomatoes.',
    target: 'conversation',
    trigger: {
      schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
    },
  });
});

test('it takes the fields that the caller overrides', () => {
  expect(buildTestDefineInput({ brief: 'Soak them.' })).toMatchObject({ brief: 'Soak them.' });
});
