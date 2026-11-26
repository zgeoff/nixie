import { z } from 'zod';
import type { PeriodStore } from '../types';
import { buildVersion3Store } from './build-version-3-store';
import { buildVersion4Store } from './build-version-4-store';
import type { LimitTable } from './limit-table';
import { parsePeriodStore } from './parse-period-store';
import { sandboxNameSchema } from './sandbox-name-schema';
import { version3StoreSchema } from './version-3-store-schema';

export type StartStore =
  | { readonly kind: 'routes'; readonly store: PeriodStore }
  | {
      readonly kind: 'moved';
      readonly store: PeriodStore;

      // one entry for each step the store moved through, in order, which the gateway logs
      readonly steps: readonly Readonly<Record<string, number>>[];
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

// A store older than version 3 moves through version 3 first, then every store of version 3 moves
// to version 4, so the two steps run once each and in that order. Any other shape of a store that
// is not version 4 throws.
export function parseStartStore(
  stored: unknown,
  nowMs: number,
  zone: string,
  table: LimitTable,
): StartStore {
  const routeIDs = Object.keys(table.routes);
  const version3 = version3StoreSchema.safeParse(stored);

  if (version3.success) {
    return {
      kind: 'moved',
      store: buildVersion4Store(version3.data, nowMs, zone, table),
      steps: [{ version: 3 }],
    };
  }

  const limits = limitsCountSchema.safeParse(stored);

  if (limits.success) {
    const earlier = buildVersion3Store(
      { kind: 'total', lost: limits.data.lost === true },
      nowMs,
      zone,
      routeIDs,
    );

    return {
      kind: 'moved',
      store: buildVersion4Store(earlier, nowMs, zone, table),
      steps: [{ dollars: limits.data.dollars, tokens: limits.data.tokens }, { version: 3 }],
    };
  }

  const periods = periodsCountSchema.safeParse(stored);

  if (periods.success) {
    const day = periods.data.periods.day;
    const month = periods.data.periods.month;

    const earlier = buildVersion3Store(
      {
        kind: 'periods',
        lost: periods.data.lost === true,
        day,
        month,
        sandboxes: periods.data.sandboxes,
      },
      nowMs,
      zone,
      routeIDs,
    );

    return {
      kind: 'moved',
      store: buildVersion4Store(earlier, nowMs, zone, table),
      steps: [
        {
          dayDollars: day.dollars,
          dayTokens: day.tokens,
          monthDollars: month.dollars,
          monthTokens: month.tokens,
        },
        { version: 3 },
      ],
    };
  }

  return { kind: 'routes', store: parsePeriodStore(stored) };
}
