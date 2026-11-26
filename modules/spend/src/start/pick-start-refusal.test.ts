import { expect, test } from 'bun:test';
import { pickStartRefusal } from './pick-start-refusal';

test('it refuses a secrets file that holds a model credential', () => {
  expect(
    pickStartRefusal({
      credentialCount: 1,
      pathProfileIDs: [],
      gatewayZone: 'UTC',
      defaultZone: 'UTC',
    }),
  ).toContain('model_credentials');
});

test('it refuses a gateway zone that differs from the default zone', () => {
  expect(
    pickStartRefusal({
      credentialCount: 0,
      pathProfileIDs: [],
      gatewayZone: 'Europe/London',
      defaultZone: 'UTC',
    }),
  ).toBe(
    "the gateway counts its periods in Europe/London, and nixie's time.default_zone is UTC; set them equal",
  );
});

test('it refuses a profile base URL that has a path', () => {
  expect(
    pickStartRefusal({
      credentialCount: 0,
      pathProfileIDs: ['work', 'home'],
      gatewayZone: 'UTC',
      defaultZone: 'UTC',
    }),
  ).toContain('fix work, home');
});

test('it allows a start with no credential and equal zones', () => {
  expect(
    pickStartRefusal({
      credentialCount: 0,
      pathProfileIDs: [],
      gatewayZone: 'UTC',
      defaultZone: 'UTC',
    }),
  ).toBeNull();
});

test('it allows a start when the gateway has not answered, so its zone is unknown', () => {
  expect(
    pickStartRefusal({
      credentialCount: 0,
      pathProfileIDs: [],
      gatewayZone: null,
      defaultZone: 'UTC',
    }),
  ).toBeNull();
});
