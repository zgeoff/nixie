import { z } from 'zod';
import type { PeriodStore } from '../types';
import { buildFreshStore } from './build-fresh-store';
import { parsePeriodStore } from './parse-period-store';

export type StartStore =
  | { readonly kind: 'periods'; readonly store: PeriodStore }
  | {
      readonly kind: 'moved';
      readonly store: PeriodStore;
      readonly old: { readonly dollars: number; readonly tokens: number };
    };

const limitsCountSchema = z.strictObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  lost: z.literal(true).optional(),
});

// The count of a limits config is one total that never reset, so it says nothing of today's or
// this month's spend: the periods start at zero. The lost mark carries over, because only an
// operator may clear it. Any other shape throws, so the gateway stops at start.
export function parseStartStore(stored: unknown, nowMs: number, zone: string): StartStore {
  const old = limitsCountSchema.safeParse(stored);

  if (!old.success) {
    return { kind: 'periods', store: parsePeriodStore(stored) };
  }

  return {
    kind: 'moved',
    store: { ...buildFreshStore(nowMs, zone), lost: old.data.lost === true },
    old: { dollars: old.data.dollars, tokens: old.data.tokens },
  };
}
