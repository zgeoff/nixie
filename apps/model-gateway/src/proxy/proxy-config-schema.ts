import { isAbsolute } from 'node:path';
import { modelPricesSchema } from '@heynixie/models/prices';
import { modelAPIs } from '@heynixie/wire';
import { z } from 'zod';
import type { ProxyConfig, RouteLimits } from '../types';

const periodsSchema = z.strictObject({
  zone: z.string().refine(isZone, { message: 'the zone is not an IANA zone' }),
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

const providerIDSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u, 'a provider ID is a lowercase slug');

const loginSchema = z.strictObject({
  file: z.string().refine((path) => isAbsolute(path), {
    message: 'the login file is an absolute path',
  }),
  routeKeyFile: z.string().refine((path) => isAbsolute(path), {
    message: 'the route key file is an absolute path',
  }),
});

// US dollars. The cap of a day's raise is twice the day's limit unless the route sets one.
const routeLimitsSchema = z
  .strictObject({
    day: z.number().positive(),
    month: z.number().positive(),
    dayCap: z.number().positive().optional(),
  })
  .refine((limits) => limits.day <= (limits.dayCap ?? limits.day * 2), {
    message: 'the day cap is below the day limit',
  });

// a provider's limits are required, because they cap what nixie spends however many models it adds
const providerSchema = z.strictObject({ limits: routeLimitsSchema });

const routeSchema = z.strictObject({
  provider: providerIDSchema,
  api: z.enum(modelAPIs).default('anthropic-messages'),
  upstream: z.url({ protocol: /^https?$/u }),
  model: z.string().min(1),
  providerPin: z.string().min(1).optional(),
  prices: modelPricesSchema,
  maxOutputTokens: z.int().positive().optional(),
  login: loginSchema.optional(),
  limits: routeLimitsSchema.optional(),
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
    limits: z
      .never({
        error:
          'the config sets limits for all routes, and no limit spans providers: set limits under providers.<id>.limits',
      })
      .optional(),
    periods: periodsSchema,
    control: controlSchema,
    countBySandbox: z.boolean().optional(),
    override: z
      .string()
      .refine((path) => isAbsolute(path), { message: 'the override file is an absolute path' })
      .optional(),
    capture: captureSchema.optional(),
    providers: z
      .record(providerIDSchema, providerSchema)
      .refine((providers) => Object.keys(providers).length > 0, {
        message: 'the proxy names no provider',
      }),
    routes: z
      .record(routeIDSchema, routeSchema)
      .refine((routes) => Object.keys(routes).length > 0, {
        message: 'the proxy names no route',
      }),
  })
  .superRefine((config, ctx) => {
    for (const [id, route] of Object.entries(config.routes)) {
      if (!Object.hasOwn(config.providers, route.provider)) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', id, 'provider'],
          message: `the route ${id} names the provider ${route.provider}, which the config's providers lack`,
        });
      }

      if (route.api === 'openai-responses' && route.maxOutputTokens === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', id, 'maxOutputTokens'],
          message: `the route ${id} speaks openai-responses and sets no maxOutputTokens, which bounds a reply whose request sets no max_output_tokens`,
        });
      }
    }
  })
  .transform((config): ProxyConfig => ({
    listen: config.listen,
    store: config.store,
    periods: {
      zone: config.periods.zone,
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
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([id, provider]) => [
        id,
        { limits: buildLimits(provider.limits) },
      ]),
    ),
    routes: Object.fromEntries(
      Object.entries(config.routes).map(([id, route]) => [
        id,
        {
          provider: route.provider,
          api: route.api,
          upstream: route.upstream.replace(/\/+$/u, ''),
          model: route.model,
          providerPin: route.providerPin ?? null,
          prices: route.prices,
          maxOutputTokens: route.maxOutputTokens ?? null,
          login: route.login ?? null,
          limits: route.limits === undefined ? null : buildLimits(route.limits),
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

function buildLimits(limits: z.infer<typeof routeLimitsSchema>): RouteLimits {
  return {
    day: limits.day,
    month: limits.month,
    dayCap: limits.dayCap ?? limits.day * 2,
  };
}
