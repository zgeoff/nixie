import { expect, test } from 'bun:test';
import { webFetchConfigSchema } from './web-fetch-config-schema';

test('it takes every default when the section is empty', () => {
  const result = webFetchConfigSchema.safeParse({});

  expect(result.data).toStrictEqual({
    limits: {
      bodyBytes: 2_097_152,
      timeoutMs: 15_000,
      redirects: 5,
      textBytes: 20_000,
      imageBytes: 5_242_880,
    },
    sandboxLimits: { vcpus: 1, memoryMiB: 192, diskMiB: 4096 },
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
    cacheMs: 300_000,
    backoff: { backoffMs: 30_000, backoffCapMs: 300_000, backoffWaitMs: 5000 },
    secretTypedURLCovers: 'redirects',
    secretOwnValues: [
      'deployment_key',
      'impd_token',
      'definitions_export_token',
      'definitions_export_app_key',
      'model_credentials',
      'connector_credentials',
    ],
    secretOwnValueMinChars: 8,
  });
});

test('it takes the limits the file names', () => {
  const result = webFetchConfigSchema.safeParse({
    body_bytes: 1024,
    timeout_ms: 5000,
    redirects: 0,
    text_bytes: 512,
    link_path_chars: 12,
    page_store_bytes: 4096,
    image_bytes: 2048,
    image_long_edge: 800,
  });

  expect(result.data).toStrictEqual({
    limits: { bodyBytes: 1024, timeoutMs: 5000, redirects: 0, textBytes: 512, imageBytes: 2048 },
    sandboxLimits: { vcpus: 1, memoryMiB: 192, diskMiB: 4096 },
    linkPathChars: 12,
    pageStoreBytes: 4096,
    imageLongEdge: 800,
    cacheMs: 300_000,
    backoff: { backoffMs: 30_000, backoffCapMs: 300_000, backoffWaitMs: 5000 },
    secretTypedURLCovers: 'redirects',
    secretOwnValues: [
      'deployment_key',
      'impd_token',
      'definitions_export_token',
      'definitions_export_app_key',
      'model_credentials',
      'connector_credentials',
    ],
    secretOwnValueMinChars: 8,
  });
});

test('it refuses a limit of zero bytes', () => {
  const result = webFetchConfigSchema.safeParse({ body_bytes: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['body_bytes'] });
});

test('it refuses a link path length of zero characters', () => {
  const result = webFetchConfigSchema.safeParse({ link_path_chars: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['link_path_chars'] });
});

test('it refuses a page store of zero bytes', () => {
  const result = webFetchConfigSchema.safeParse({ page_store_bytes: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['page_store_bytes'] });
});

test.each(['image_bytes', 'image_long_edge'])('it refuses an %s of zero', (key) => {
  const result = webFetchConfigSchema.safeParse({ [key]: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: [key] });
});

test('it refuses an unknown key', () => {
  const result = webFetchConfigSchema.safeParse({ body_byte: 1024 });

  expect(result.error?.issues).toPartiallyContain({
    path: [],
    code: 'unrecognized_keys',
    keys: ['body_byte'],
  });
});

test('it refuses a count of fetches per sandbox, since every fetch has a sandbox of its own', () => {
  const result = webFetchConfigSchema.safeParse({ fetches_per_sandbox: 10 });

  expect(result.error?.issues).toPartiallyContain({
    path: [],
    code: 'unrecognized_keys',
    keys: ['fetches_per_sandbox'],
  });
});

test('it takes the pause keys the file names, and accepts 0', () => {
  const result = webFetchConfigSchema.safeParse({
    backoff_ms: 10_000,
    backoff_cap_ms: 0,
    backoff_wait_ms: 0,
  });

  expect(result.data?.backoff).toStrictEqual({
    backoffMs: 10_000,
    backoffCapMs: 0,
    backoffWaitMs: 0,
  });
});

test.each(['backoff_ms', 'backoff_cap_ms', 'backoff_wait_ms'])(
  'it refuses a negative %s',
  (key) => {
    const result = webFetchConfigSchema.safeParse({ [key]: -1 });

    expect(result.error?.issues).toPartiallyContain({ path: [key] });
  },
);

test('it takes the secret scan keys the file names', () => {
  const result = webFetchConfigSchema.safeParse({
    secret_typed_url_covers: 'named_url',
    secret_own_values: ['settings', 'impd_token'],
    secret_own_value_min_chars: 12,
  });

  expect(result.data).toMatchObject({
    secretTypedURLCovers: 'named_url',
    secretOwnValues: ['settings', 'impd_token'],
    secretOwnValueMinChars: 12,
  });
});

test('it accepts an empty list of own value entries', () => {
  const result = webFetchConfigSchema.safeParse({ secret_own_values: [] });

  expect(result.data?.secretOwnValues).toStrictEqual([]);
});

test('it refuses an entry name that the secrets file lacks', () => {
  const result = webFetchConfigSchema.safeParse({ secret_own_values: ['api_token'] });

  expect(result.error?.issues).toPartiallyContain({ path: ['secret_own_values', 0] });
});

test('it refuses a minimum own value length of zero', () => {
  const result = webFetchConfigSchema.safeParse({ secret_own_value_min_chars: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['secret_own_value_min_chars'] });
});

test('it refuses a typed URL cover that is neither named_url nor redirects', () => {
  const result = webFetchConfigSchema.safeParse({ secret_typed_url_covers: 'everything' });

  expect(result.error?.issues).toPartiallyContain({ path: ['secret_typed_url_covers'] });
});

test.each([
  ['a time', 60_000],
  ['0, which turns the cache off', 0],
])('it takes cache_ms as %s', (_name, cacheMs) => {
  const result = webFetchConfigSchema.safeParse({ cache_ms: cacheMs });

  expect(result.data?.cacheMs).toBe(cacheMs);
});

test.each([
  ['a negative time', -1],
  ['a fraction', 1.5],
])('it refuses cache_ms as %s', (_name, cacheMs) => {
  const result = webFetchConfigSchema.safeParse({ cache_ms: cacheMs });

  expect(result.success).toBeFalse();
});
