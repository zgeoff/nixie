import { expect, test } from 'bun:test';
import { buildTestDefineInput } from './build-test-define-input';

test('it builds the weekly schedule of the tomatoes', () => {
  expect(buildTestDefineInput()).toStrictEqual({
    name: 'Water the tomatoes',
    brief: 'Water the tomatoes.',
    trigger: {
      schedule: {
        repeat: { frequency: 'weekly', byDay: ['fri'], at: ['08:00'], starts: '2026-11-20' },
        zone: 'owner',
        catchUp: 'once',
      },
    },
  });
});

test('it takes the fields that the caller overrides', () => {
  expect(buildTestDefineInput({ brief: 'Soak them.' })).toMatchObject({ brief: 'Soak them.' });
});
