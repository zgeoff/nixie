import { expect, test } from 'bun:test';
import { formatAboveCap, pickStartRefusal } from './pick-start-refusal';

test('it refuses a secrets file that holds a model credential', () => {
  expect(
    pickStartRefusal({ credentialCount: 1, gatewayZone: 'UTC', defaultZone: 'UTC' }),
  ).toContain('model_credentials');
});

test('it refuses a gateway zone that differs from the default zone', () => {
  expect(
    pickStartRefusal({ credentialCount: 0, gatewayZone: 'Europe/London', defaultZone: 'UTC' }),
  ).toBe(
    "the gateway counts its periods in Europe/London, and nixie's time.default_zone is UTC; set them equal",
  );
});

test('it allows a start with no credential and equal zones', () => {
  expect(
    pickStartRefusal({ credentialCount: 0, gatewayZone: 'UTC', defaultZone: 'UTC' }),
  ).toBeNull();
});

test('it allows a start when the gateway has not answered, so its zone is unknown', () => {
  expect(
    pickStartRefusal({ credentialCount: 0, gatewayZone: null, defaultZone: 'UTC' }),
  ).toBeNull();
});

test('it names the cap in a refused limit', () => {
  expect(
    formatAboveCap({
      kind: 'above_cap',
      period: 'day',
      cap: { dollars: 120, tokens: 160_000_000 },
    }),
  ).toBe(
    'the gateway refuses the configured limit of the day, which is above its cap of 120 dollars and 160000000 tokens',
  );
});
