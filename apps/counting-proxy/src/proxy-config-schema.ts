import { modelPricesSchema } from '@heynixie/models';
import { z } from 'zod';
import type { ProxyConfig } from './types';

const routeIDSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u, 'a route ID is a lowercase slug');

const routeSchema = z.strictObject({
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

export const proxyConfigSchema = z
  .strictObject({
    listen: z.strictObject({
      hostname: z.string().min(1).default('127.0.0.1'),
      port: z.int().min(0).max(65_535),
    }),
    store: z.string().min(1),
    limits: limitsSchema,
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
    routes: Object.fromEntries(
      Object.entries(config.routes).map(([id, route]) => [
        id,
        { upstream: route.upstream.replace(/\/+$/u, ''), model: route.model, prices: route.prices },
      ]),
    ),
  }));
