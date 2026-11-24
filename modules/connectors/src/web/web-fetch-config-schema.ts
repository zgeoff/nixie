import { secretsEntryNames } from '@heynixie/credentials';
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
    cache_ms: millisecondsSchema.default(webFetchDefaults.cacheMs),
    backoff_ms: millisecondsSchema.default(webFetchDefaults.backoff.backoffMs),
    backoff_cap_ms: millisecondsSchema.default(webFetchDefaults.backoff.backoffCapMs),
    backoff_wait_ms: millisecondsSchema.default(webFetchDefaults.backoff.backoffWaitMs),
    secret_typed_url_covers: z
      .enum(['named_url', 'redirects'])
      .default(webFetchDefaults.secretTypedURLCovers),
    secret_own_values: z
      .array(z.enum(secretsEntryNames))
      .default([...webFetchDefaults.secretOwnValues]),
    secret_own_value_min_chars: countSchema.default(webFetchDefaults.secretOwnValueMinChars),
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
    cacheMs: config.cache_ms,
    backoff: {
      backoffMs: config.backoff_ms,
      backoffCapMs: config.backoff_cap_ms,
      backoffWaitMs: config.backoff_wait_ms,
    },
    secretTypedURLCovers: config.secret_typed_url_covers,
    secretOwnValues: config.secret_own_values,
    secretOwnValueMinChars: config.secret_own_value_min_chars,
  }));
