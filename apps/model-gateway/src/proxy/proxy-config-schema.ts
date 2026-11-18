import { isAbsolute } from 'node:path';
import { modelPricesSchema } from '@heynixie/models/prices';
import { modelAPIs } from '@heynixie/wire';
import { z } from 'zod';
import type { ProxyConfig } from '../types';

const measuresSchema = z.strictObject({
  dollars: z.number().positive(),
  tokens: z.number().positive(),
});

const periodsSchema = z.strictObject({
  zone: z.string().refine(isZone, { message: 'the zone is not an IANA zone' }),
});

// twice nixie's default day and month limits
const defaultCaps = {
  day: { dollars: 120, tokens: 160_000_000 },
  month: { dollars: 1200, tokens: 1_200_000_000 },
};

const capsSchema = z.strictObject({
  day: measuresSchema.default(defaultCaps.day),
  month: measuresSchema.default(defaultCaps.month),
});

const controlSchema = z.strictObject({
  listen: z.strictObject({
    hostname: z.string().min(1).default('127.0.0.1'),
    port: z.int().min(0).max(65_535),
  }),
  tokenFile: z.string().refine((path) => isAbsolute(path), {
    message: 'the control token file is an absolute path',
  }),
});

const routeIDSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u, 'a route ID is a lowercase slug');

const routeSchema = z.strictObject({
  api: z.enum(modelAPIs).default('anthropic-messages'),
  upstream: z.url({ protocol: /^https?$/u }),
  model: z.string().min(1),
  providerPin: z.string().min(1).optional(),
  prices: modelPricesSchema,
  maxOutputTokens: z.int().positive().optional(),
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
    limits: limitsSchema.optional(),
    periods: periodsSchema.optional(),
    caps: capsSchema.optional(),
    control: controlSchema.optional(),
    countBySandbox: z.boolean().optional(),
    override: z
      .string()
      .refine((path) => isAbsolute(path), { message: 'the override file is an absolute path' })
      .optional(),
    capture: captureSchema.optional(),
    routes: z
      .record(routeIDSchema, routeSchema)
      .refine((routes) => Object.keys(routes).length > 0, {
        message: 'the proxy names no route',
      }),
  })
  .superRefine((config, ctx) => {
    for (const [id, route] of Object.entries(config.routes)) {
      if (route.api === 'openai-responses' && route.maxOutputTokens === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', id, 'maxOutputTokens'],
          message: `the route ${id} speaks openai-responses and sets no maxOutputTokens, which bounds a reply whose request sets no max_output_tokens`,
        });
      }
    }

    if (config.limits !== undefined && config.periods !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['periods'],
        message: 'the config sets both limits and periods, and it sets exactly one',
      });
    }

    if (config.limits === undefined && config.periods === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['periods'],
        message: 'the config sets neither limits nor periods, and it sets exactly one',
      });
    }

    if (config.periods !== undefined && config.control === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['control'],
        message: 'a config with periods needs a control listener',
      });
    }

    if (config.periods === undefined) {
      for (const key of ['caps', 'control', 'countBySandbox', 'override'] as const) {
        if (config[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} needs periods, and a limits config sets none of these keys`,
          });
        }
      }
    }
  })
  .transform((config): ProxyConfig => ({
    listen: config.listen,
    store: config.store,
    limits:
      config.limits === undefined
        ? null
        : { dollars: config.limits.dollars ?? null, tokens: config.limits.tokens ?? null },
    periods:
      config.periods === undefined || config.control === undefined
        ? null
        : {
            zone: config.periods.zone,
            caps: config.caps ?? defaultCaps,
            control: config.control,
            countBySandbox: config.countBySandbox ?? false,
            override: config.override ?? null,
          },
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
          providerPin: route.providerPin ?? null,
          prices: route.prices,
          maxOutputTokens: route.maxOutputTokens ?? null,
        },
      ]),
    ),
  }));

function isZone(zone: string): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone });

    return formatter.resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}
