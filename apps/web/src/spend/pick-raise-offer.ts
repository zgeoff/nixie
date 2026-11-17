import type { SpendTrip } from '../types';

export interface RaiseOffer {
  readonly dollars: number;
  readonly tokens: number;
  readonly turns: number;
}

const measures = ['dollars', 'tokens', 'turns'] as const;

// "Raise today's limit" offers today's limit plus half, up to the cap, in each measure that
// tripped. A measure that did not trip keeps the limit in force, held to the cap too, because a
// raise above the cap is refused, and a raise never lowers a total that the host set above it.
export function pickRaiseOffer(stop: SpendTrip): RaiseOffer {
  const offer = { dollars: 0, tokens: 0, turns: 0 };

  for (const measure of measures) {
    const isTripped = measure === stop.measure || stop.used[measure] >= stop.limits[measure];
    const limit = stop.limits[measure];
    const target = isTripped ? addHalf(measure, limit) : limit;

    offer[measure] = Math.min(stop.cap[measure], target);
  }

  return offer;
}

type Measure = (typeof measures)[number];

function addHalf(measure: Measure, limit: number): number {
  const raised = limit * 1.5;

  return measure === 'dollars' ? Math.round(raised * 100) / 100 : Math.round(raised);
}
