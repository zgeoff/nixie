import { expect, test } from 'bun:test';
import { resolveSearchSettings } from './resolve-search-settings';

test('it resolves the key from the connector_credentials entry the reference names', () => {
  const settings = resolveSearchSettings(
    { daily_call_cap: 50, credential: 'deployment:search', api_url: 'https://kagi.test/api/v1' },
    { search: 'search-key-a', other: 'other-key' },
  );

  expect(settings).toStrictEqual({
    apiKey: 'search-key-a',
    apiURL: 'https://kagi.test/api/v1',
    dailyCallCap: 50,
  });
});

test('it resolves no search when the configuration names no credential', () => {
  const settings = resolveSearchSettings(
    { daily_call_cap: 200, credential: null, api_url: 'https://kagi.test/api/v1' },
    { search: 'search-key-a' },
  );

  expect(settings).toBeNull();
});

test('it refuses a reference the secrets file holds no entry for, and never names a value', () => {
  expect(() =>
    resolveSearchSettings(
      { daily_call_cap: 200, credential: 'deployment:kagi', api_url: 'https://kagi.test/api/v1' },
      { search: 'search-key-a' },
    ),
  ).toThrow(
    'search.credential is deployment:kagi, and the secrets file has no connector_credentials entry kagi',
  );
});

test('it refuses a reference to a name every object holds', () => {
  expect(() =>
    resolveSearchSettings(
      {
        daily_call_cap: 200,
        credential: 'deployment:toString',
        api_url: 'https://kagi.test/api/v1',
      },
      {},
    ),
  ).toThrow('the secrets file has no connector_credentials entry toString');
});
