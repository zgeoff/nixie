import { z } from 'zod';
import type { PeriodStore } from '../types';
import { buildFreshStore } from './build-fresh-store';
import { parsePeriodStore } from './parse-period-store';
import { sandboxNameSchema } from './sandbox-name-schema';

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
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
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

// An earlier store says nothing of a route's spend, so every route starts at zero and the gateway
// logs the old totals. The lost mark and the sandboxes carry over. Any other shape throws.
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

    return {
      kind: 'moved',
      store: {
        ...fresh,
        lost: earlier.data.lost === true,
        sandboxes: Object.fromEntries(
          Object.entries(sandboxes).map(([name, held]) => [
            name,
            { dollars: held.dollars, tokens: held.tokens, limit: held.limit, lastRefusal: null },
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
