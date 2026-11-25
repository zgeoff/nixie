import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { PeriodStore, RouteCount } from '../types';
import { buildFreshStore } from './build-fresh-store';
import { parsePeriodStore } from './parse-period-store';
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

const periodsCountSchema = z.looseObject({
  version: z.literal(2),
  lost: z.literal(true).optional(),
  periods: z.looseObject({ day: legacyPeriodSchema, month: legacyPeriodSchema }),
  sandboxes: z.record(sandboxNameSchema, legacySandboxSchema),
});

// A count of one total starts every route at zero, and the gateway logs the old totals. A version 2
// store counts the one route of a single-route gateway, which keeps each period under way. The lost
// mark and the sandboxes carry over. Any other shape throws.
export function parseStartStore(
  stored: unknown,
  nowMs: number,
  zone: string,
  routeIDs: readonly string[],
): StartStore {
  const fresh = buildFreshStore(nowMs, zone, routeIDs);
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
    const [onlyRoute] = routeIDs;

    const routes =
      routeIDs.length === 1 && onlyRoute !== undefined
        ? {
            [onlyRoute]: {
              day: carryCount(fresh.routes[onlyRoute]?.day, periods.day),
              month: carryCount(fresh.routes[onlyRoute]?.month, periods.month),
            },
          }
        : fresh.routes;

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
