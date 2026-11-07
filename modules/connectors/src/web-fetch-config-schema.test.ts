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
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
    linkPathChars: 24,
    pageStoreBytes: 20_971_520,
    imageLongEdge: 1568,
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
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
    linkPathChars: 12,
    pageStoreBytes: 4096,
    imageLongEdge: 800,
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
