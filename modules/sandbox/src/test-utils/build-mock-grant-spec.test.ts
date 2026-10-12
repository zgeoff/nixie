import { expect, test } from 'bun:test';
import { buildMockGrantSpec } from './build-mock-grant-spec';

test('it builds a default grant spec', () => {
  expect(buildMockGrantSpec()).toStrictEqual({
    secret: expect.any(String),
    host: expect.any(String),
    env: { API_KEY: expect.any(String) },
  });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockGrantSpec({ secret: 'model-default', env: {} })).toStrictEqual({
    secret: 'model-default',
    host: expect.any(String),
    env: {},
  });
});
