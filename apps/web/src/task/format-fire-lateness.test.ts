import { expect, test } from 'bun:test';
import { formatFireLateness } from './format-fire-lateness';

test('it says how late a catch-up fire fired', () => {
  expect(
    formatFireLateness({
      firedAt: '2027-03-11T22:05:00.000Z',
      isCatchUp: true,
      scheduledFor: '2027-03-11T21:00:00.000Z',
    }),
  ).toBe('fired 1 hour 5 minutes late');
});

test('it says nothing of a fire on time', () => {
  expect(
    formatFireLateness({
      firedAt: '2027-03-11T21:00:00.000Z',
      isCatchUp: false,
      scheduledFor: '2027-03-11T21:00:00.000Z',
    }),
  ).toBeNull();
});
