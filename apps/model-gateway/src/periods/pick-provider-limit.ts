import { pickLimit } from './pick-limit';
import type { PeriodLimitAsk } from './types';

// The limit in force of a provider's period, or null for a provider the config lacks
export function pickProviderLimit(ask: PeriodLimitAsk): number | null {
  const configured = Object.hasOwn(ask.limits.providers, ask.id)
    ? ask.limits.providers[ask.id]
    : null;

  const count = Object.hasOwn(ask.store.providers, ask.id)
    ? ask.store.providers[ask.id]?.[ask.period]
    : undefined;

  const override = Object.hasOwn(ask.overrides.providers, ask.id)
    ? ask.overrides.providers[ask.id]
    : undefined;

  return pickLimit(configured, count, override, ask.period);
}
