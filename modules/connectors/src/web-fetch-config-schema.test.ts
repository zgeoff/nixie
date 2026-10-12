import { expect, test } from 'bun:test';
import { webFetchConfigSchema } from './web-fetch-config-schema';

test('it takes every default when the section is empty', () => {
  const result = webFetchConfigSchema.safeParse({});

  expect(result.data).toStrictEqual({
    limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
    fetchesPerSandbox: 50,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
  });
});

test('it takes the limits the file names', () => {
  const result = webFetchConfigSchema.safeParse({
    body_bytes: 1024,
    timeout_ms: 5000,
    redirects: 0,
    text_bytes: 512,
    fetches_per_sandbox: 10,
  });

  expect(result.data).toStrictEqual({
    limits: { bodyBytes: 1024, timeoutMs: 5000, redirects: 0, textBytes: 512 },
    fetchesPerSandbox: 10,
    sandboxLimits: { vcpus: 1, memoryMiB: 512, diskMiB: 4096 },
  });
});

test('it refuses a limit of zero bytes', () => {
  const result = webFetchConfigSchema.safeParse({ body_bytes: 0 });

  expect(result.error?.issues).toPartiallyContain({ path: ['body_bytes'] });
});

test('it refuses an unknown key', () => {
  const result = webFetchConfigSchema.safeParse({ body_byte: 1024 });

  expect(result.error?.issues).toPartiallyContain({
    path: [],
    code: 'unrecognized_keys',
    keys: ['body_byte'],
  });
});
