import type { z } from 'zod';
import type { Overrides, PeriodName, PeriodStore } from '../types';
import type { LimitTable } from './limit-table';
import type { version3StoreSchema } from './version-3-store-schema';

export interface PeriodLimitAsk {
  readonly store: PeriodStore;
  readonly limits: LimitTable;
  readonly overrides: Overrides;
  readonly id: string;
  readonly period: PeriodName;
}

export type Version3Store = z.infer<typeof version3StoreSchema>;

// one period of the store of version 2, which held one total for every route
export interface LegacyPeriod {
  readonly start: string;
  readonly dollars: number;
  readonly raise?: { readonly dollars: number } | null | undefined;
  readonly trippedAt?: string | null | undefined;
}

export interface LegacySandbox {
  readonly dollars: number;
  readonly tokens: number;
  readonly limit: { readonly dollars: number; readonly tokens: number } | null;
}

// a store older than version 3: one total of dollars and tokens, or the version 2 periods
export type LegacyStore =
  | { readonly kind: 'total'; readonly lost: boolean }
  | {
      readonly kind: 'periods';
      readonly lost: boolean;
      readonly day: LegacyPeriod;
      readonly month: LegacyPeriod;
      readonly sandboxes: Readonly<Record<string, LegacySandbox>>;
    };
