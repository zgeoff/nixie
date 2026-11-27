import { expect, test } from 'bun:test';
import { makeFetchBackoff } from '@heynixie/connectors';
import { createFakeClock } from '@zgeoff/testing/clock';
import { buildDeviceFetch } from './build-device-fetch';

function setupTest() {
  return {
    source: {
      packageRegistry: 'https://registry.example',
      backoff: makeFetchBackoff({
        backoffMs: 1000,
        backoffCapMs: 10_000,
        clock: createFakeClock({ startMs: 0 }),
      }),
      checkAddress: () => true,
      findSecret: () => null,
      logger: () => {},
    },
  };
}

test('it builds no device fetch from a web fetch that holds no device sandbox', () => {
  const ctx = setupTest();

  expect(buildDeviceFetch({ ...ctx.source, deviceFetch: null })).toBeNull();
});

test('it builds the registry of a web fetch that holds a device sandbox', () => {
  const ctx = setupTest();

  const deviceFetch = {
    readBody: () => Promise.reject(new Error('unused')),
    readPackage: () => Promise.reject(new Error('unused')),
  };

  expect(buildDeviceFetch({ ...ctx.source, deviceFetch })?.registry).toBe(
    'https://registry.example',
  );
});
