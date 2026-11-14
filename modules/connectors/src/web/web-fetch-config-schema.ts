import { z } from 'zod';
import type { WebFetchConfig } from './web-fetch-defaults';
import { webFetchDefaults } from './web-fetch-defaults';

const countSchema = z.number().int().positive();
const millisecondsSchema = z.number().int().nonnegative();

export const webFetchConfigSchema = z
  .strictObject({
    body_bytes: countSchema.default(webFetchDefaults.limits.bodyBytes),
    timeout_ms: countSchema.default(webFetchDefaults.limits.timeoutMs),
    redirects: z.number().int().nonnegative().default(webFetchDefaults.limits.redirects),
    text_bytes: countSchema.default(webFetchDefaults.limits.textBytes),
    link_path_chars: countSchema.default(webFetchDefaults.linkPathChars),
    page_store_bytes: countSchema.default(webFetchDefaults.pageStoreBytes),
    image_bytes: countSchema.default(webFetchDefaults.limits.imageBytes),
    image_long_edge: countSchema.default(webFetchDefaults.imageLongEdge),
    backoff_ms: millisecondsSchema.default(webFetchDefaults.backoff.backoffMs),
    backoff_cap_ms: millisecondsSchema.default(webFetchDefaults.backoff.backoffCapMs),
    backoff_wait_ms: millisecondsSchema.default(webFetchDefaults.backoff.backoffWaitMs),
  })
  .transform((config): WebFetchConfig => ({
    limits: {
      bodyBytes: config.body_bytes,
      timeoutMs: config.timeout_ms,
      redirects: config.redirects,
      textBytes: config.text_bytes,
      imageBytes: config.image_bytes,
    },
    sandboxLimits: webFetchDefaults.sandboxLimits,
    linkPathChars: config.link_path_chars,
    pageStoreBytes: config.page_store_bytes,
    imageLongEdge: config.image_long_edge,
    backoff: {
      backoffMs: config.backoff_ms,
      backoffCapMs: config.backoff_cap_ms,
      backoffWaitMs: config.backoff_wait_ms,
    },
  }));
