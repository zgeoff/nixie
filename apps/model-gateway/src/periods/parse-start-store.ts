import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { PeriodStore, RouteCount } from '../types';
import { buildFreshStore } from './build-fresh-store';
import type { LimitTable } from './limit-table';
import { parsePeriodStore, routeCountSchema } from './parse-period-store';
import { sandboxLimitSchema } from './sandbox-limit-schema';
import { sandboxNameSchema } from './sandbox-name-schema';
import { toMicros } from './to-micros';

export type StartStore =
  | { readonly kind: 'routes'; readonly store: PeriodStore }
  | {
      readonly kind: 'moved';
      readonly store: PeriodStore;

      // the totals the old store held, which the gateway logs
      readonly old: Readonly<Record<string, number>>;
    };

const limitsCountSchema = z.strictObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  lost: z.literal(true).optional(),
});

const legacyPeriodSchema = z.looseObject({
  start: z.string(),
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  raise: z.looseObject({ dollars: z.number().nonnegative() }).nullable().optional(),
  trippedAt: z.iso.datetime().nullable().optional(),
});

const legacySandboxSchema = z.looseObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  limit: z
    .strictObject({ dollars: z.number().nonnegative(), tokens: z.number().nonnegative() })
    .nullable(),
});

// the store of version 3, which counted routes only and named no provider in a refusal
const routeRefusalSchema = z.strictObject({
  counter: z.enum(['route_day', 'route_month', 'sandbox']),
  route: z.string(),
  atMs: z.number(),
});

const routeSandboxSchema = z.strictObject({
  micros: z.int().nonnegative(),
  tokens: z.number().nonnegative(),
  limit: sandboxLimitSchema.nullable(),
  lastRefusal: routeRefusalSchema.nullable().default(null),
  limitRevision: z.int().nonnegative().default(0),
});

const routePeriodsSchema = z.strictObject({ day: routeCountSchema, month: routeCountSchema });

const routeStoreSchema = z.strictObject({
  version: z.literal(3),
  lost: z.literal(true).optional(),
  routes: z.record(z.string(), routePeriodsSchema),
  sandboxes: z.record(sandboxNameSchema, routeSandboxSchema),
  lastLimitRevision: z.int().nonnegative().exactOptional(),
});

const periodsCountSchema = z.looseObject({
  version: z.literal(2),
  lost: z.literal(true).optional(),
  periods: z.looseObject({ day: legacyPeriodSchema, month: legacyPeriodSchema }),
  sandboxes: z.record(sandboxNameSchema, legacySandboxSchema),
});

// A count of one total starts every route at zero. A version 2 store gives every route the whole
// count of each period under way. A version 3 store keeps its routes. Each moves to version 4 with
// every provider at zero, because a route count can hold that copied total. Any other shape throws.
export function parseStartStore(
  stored: unknown,
  nowMs: number,
  zone: string,
  table: LimitTable,
): StartStore {
  const routeIDs = Object.keys(table.routes);
  const fresh = buildFreshStore(nowMs, zone, routeIDs, Object.keys(table.providers));
  const version3 = routeStoreSchema.safeParse(stored);

  if (version3.success) {
    const earlier = version3.data;

    return {
      kind: 'moved',
      store: {
        ...fresh,
        lost: earlier.lost === true,
        routes: earlier.routes,
        sandboxes: Object.fromEntries(
          Object.entries(earlier.sandboxes).map(([name, held]) => [
            name,
            { ...held, lastRefusal: moveRefusal(held.lastRefusal, table) },
          ]),
        ),
        ...(earlier.lastLimitRevision === undefined
          ? {}
          : { lastLimitRevision: earlier.lastLimitRevision }),
      },
      old: { version: 3 },
    };
  }

  const limits = limitsCountSchema.safeParse(stored);

  if (limits.success) {
    return {
      kind: 'moved',
      store: { ...fresh, lost: limits.data.lost === true },
      old: { dollars: limits.data.dollars, tokens: limits.data.tokens },
    };
  }

  const earlier = periodsCountSchema.safeParse(stored);

  if (earlier.success) {
    const periods = earlier.data.periods;
    const sandboxes = earlier.data.sandboxes;

    const routes = Object.fromEntries(
      routeIDs.map((routeID) => [
        routeID,
        {
          day: carryCount(fresh.routes[routeID]?.day, periods.day),
          month: carryCount(fresh.routes[routeID]?.month, periods.month),
        },
      ]),
    );

    return {
      kind: 'moved',
      store: {
        ...fresh,
        routes,
        lost: earlier.data.lost === true,
        sandboxes: Object.fromEntries(
          Object.entries(sandboxes).map(([name, held]) => [
            name,
            {
              micros: toMicros(held.dollars),
              tokens: held.tokens,
              limit: held.limit,
              lastRefusal: null,
              limitRevision: 0,
            },
          ]),
        ),
      },
      old: {
        dayDollars: periods.day.dollars,
        dayTokens: periods.day.tokens,
        monthDollars: periods.month.dollars,
        monthTokens: periods.month.tokens,
      },
    };
  }

  return { kind: 'routes', store: parsePeriodStore(stored) };
}

type RouteRefusal = z.infer<typeof routeStoreSchema>['sandboxes'][string]['lastRefusal'];

// A refusal names its route's provider from the config. One of a route the config dropped has no
// provider to name, so it goes.
function moveRefusal(
  refusal: RouteRefusal,
  limits: LimitTable,
): PeriodStore['sandboxes'][string]['lastRefusal'] {
  if (refusal === null || !Object.hasOwn(limits.providerOf, refusal.route)) {
    return null;
  }

  const provider = limits.providerOf[refusal.route];

  return provider === undefined ? null : { ...refusal, provider };
}

type LegacyPeriod = z.infer<typeof legacyPeriodSchema>;

// The earlier count joins the period that is under way, and an earlier period has ended.
function carryCount(current: RouteCount | undefined, earlier: LegacyPeriod): RouteCount {
  invariant(current, 'a fresh store holds each route');

  if (earlier.start !== current.start) {
    return current;
  }

  return {
    ...current,
    micros: toMicros(earlier.dollars),
    raise: earlier.raise?.dollars ?? null,
    trippedAt: earlier.trippedAt ?? null,
  };
}
