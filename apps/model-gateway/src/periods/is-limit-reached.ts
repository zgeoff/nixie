import { toMicros } from './to-micros';

// Whether a count of whole micros has reached a limit of US dollars, compared in whole micros.
export function isLimitReached(spentMicros: number, limitDollars: number): boolean {
  return spentMicros >= toMicros(limitDollars);
}
