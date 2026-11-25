import { isAbsolute } from 'node:path';
import { modelPricesSchema } from '@heynixie/models/prices';
import { modelAPIs } from '@heynixie/wire';
import { z } from 'zod';
import type { ProxyConfig } from '../types';

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

const routeSchema = z.strictObject({
  api: z.enum(modelAPIs).default('anthropic-messages'),
  upstream: z.url({ protocol: /^https?$/u }),
  model: z.string().min(1),
  providerPin: z.string().min(1).optional(),
  prices: modelPricesSchema,
  maxOutputTokens: z.int().positive().optional(),
  login: loginSchema.optional(),
  limits: routeLimitsSchema.optional(),
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

    for (const [id, route] of Object.entries(config.routes)) {
      if (route.login !== undefined && config.periods === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', id, 'login'],
          message: `the route ${id} holds a plan login, which needs a periods config, because the server reads the login from the control listener`,
        });
      }
    }

    for (const [id, route] of Object.entries(config.routes)) {
      if (route.limits !== undefined && config.periods === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', id, 'limits'],
          message: `the route ${id} sets limits, which need periods, and a limits config counts one total`,
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
      for (const key of ['control', 'countBySandbox', 'override'] as const) {
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
          login: route.login ?? null,
          limits:
            route.limits === undefined
              ? null
              : {
                  day: route.limits.day,
                  month: route.limits.month,
                  dayCap: route.limits.dayCap ?? route.limits.day * 2,
                },
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
