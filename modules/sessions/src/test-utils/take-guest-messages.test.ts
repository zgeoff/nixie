import { expect, test } from 'bun:test';
import { takeGuestMessages } from './take-guest-messages';

test('it takes every message the guest holds, in order', () => {
  const held = [
    { uuid: 'a1f0c2d3-0000-4000-8000-000000000001', text: 'First.' },
    { uuid: 'a1f0c2d3-0000-4000-8000-000000000002', text: 'Second.' },
  ];

  expect(takeGuestMessages({ takeMessage: () => held.shift() })).toStrictEqual([
    { uuid: 'a1f0c2d3-0000-4000-8000-000000000001', text: 'First.' },
    { uuid: 'a1f0c2d3-0000-4000-8000-000000000002', text: 'Second.' },
  ]);
});

test('it takes nothing from a guest with no message queue', () => {
  expect(takeGuestMessages({})).toStrictEqual([]);
});
