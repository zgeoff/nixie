import type { ProviderText } from '../types';

const arrivalWindowMs = 60 * 60_000;

// The texts that make an arrival: those received in the last hour. A text from before an outage
// that is older is stored and wakes nothing.
export function collectArrivalTexts(
  fresh: readonly ProviderText[],
  nowMs: number,
): readonly ProviderText[] {
  return fresh.filter((text) => text.receivedAt >= nowMs - arrivalWindowMs);
}
