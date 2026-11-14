import { isAbsolute } from 'node:path';
import { modelPricesSchema } from '@heynixie/models';
import { modelAPIs } from '@heynixie/wire';
import { z } from 'zod';
import type { ProxyConfig } from './types';

const routeIDSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u, 'a route ID is a lowercase slug');

const routeSchema = z.strictObject({
  api: z.enum(modelAPIs).default('anthropic-messages'),
  upstream: z.url({ protocol: /^https?$/u }),
  model: z.string().min(1),
  prices: modelPricesSchema,
});

const limitsSchema = z
  .strictObject({
    dollars: z.number().positive().optional(),
    tokens: z.int().positive().optional(),
  })
  .refine((limits) => limits.dollars !== undefined || limits.tokens !== undefined, {
    message: 'the limits name no dollar or token limit, and the proxy needs one to count against',
  });

const captureSchema = z.strictObject({
  spool: z.string().refine((spool) => isAbsolute(spool), {
    message: 'the capture spool is an absolute path',
  }),
  max_bytes: z.int().positive().default(536_870_912),
  max_pending: z.int().positive().default(16),
});

export const proxyConfigSchema = z
  .strictObject({
    listen: z.strictObject({
      hostname: z.string().min(1).default('127.0.0.1'),
      port: z.int().min(0).max(65_535),
    }),
    store: z.string().min(1),
    limits: limitsSchema,
    capture: captureSchema.optional(),
    routes: z
      .record(routeIDSchema, routeSchema)
      .refine((routes) => Object.keys(routes).length > 0, {
        message: 'the proxy names no route',
      }),
  })
  .transform((config): ProxyConfig => ({
    listen: config.listen,
    store: config.store,
    limits: { dollars: config.limits.dollars ?? null, tokens: config.limits.tokens ?? null },
    capture:
      config.capture === undefined
        ? null
        : {
            spool: config.capture.spool,
            maxBytes: config.capture.max_bytes,
            maxPending: config.capture.max_pending,
          },
    routes: Object.fromEntries(
      Object.entries(config.routes).map(([id, route]) => [
        id,
        {
          api: route.api,
          upstream: route.upstream.replace(/\/+$/u, ''),
          model: route.model,
          prices: route.prices,
        },
      ]),
    ),
  }));
