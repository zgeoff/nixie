import { expect, test } from 'bun:test';
import { buildMockTurnFrame } from '@heynixie/wire/test-utils';
import { getCompactWindow } from './get-compact-window';

test('it takes the profile context cap as the compact window', () => {
  expect(
    getCompactWindow(buildMockTurnFrame({ profile: { contextTokens: 400_000 } }).profile),
  ).toBe(400_000);
});

test('it compacts within 200k tokens for a profile with no context cap', () => {
  expect(getCompactWindow(buildMockTurnFrame({ profile: { contextTokens: null } }).profile)).toBe(
    200_000,
  );
});
