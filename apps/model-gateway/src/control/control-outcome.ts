import type { Measures, PeriodName } from '../types';

export type ControlOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'above_cap'; readonly period: PeriodName; readonly cap: Measures }
  | { readonly kind: 'period_ended' };
