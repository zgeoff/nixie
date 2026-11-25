const microsPerDollar = 1_000_000;

// A count of US dollars in whole micros, the unit the ledger keeps, so a long run of small replies
// adds no drift.
export function toMicros(dollars: number): number {
  return Math.round(dollars * microsPerDollar);
}
