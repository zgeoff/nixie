import { z } from 'zod';
import type { WebFetchConfig } from './web-fetch-defaults';
import { webFetchDefaults } from './web-fetch-defaults';

const countSchema = z.number().int().positive();

export const webFetchConfigSchema = z
  .strictObject({
    body_bytes: countSchema.default(webFetchDefaults.limits.bodyBytes),
    timeout_ms: countSchema.default(webFetchDefaults.limits.timeoutMs),
    redirects: z.number().int().nonnegative().default(webFetchDefaults.limits.redirects),
    text_bytes: countSchema.default(webFetchDefaults.limits.textBytes),
    fetches_per_sandbox: countSchema.default(webFetchDefaults.fetchesPerSandbox),
  })
  .transform((config): WebFetchConfig => ({
    limits: {
      bodyBytes: config.body_bytes,
      timeoutMs: config.timeout_ms,
      redirects: config.redirects,
      textBytes: config.text_bytes,
    },
    fetchesPerSandbox: config.fetches_per_sandbox,
    sandboxLimits: webFetchDefaults.sandboxLimits,
  }));
