const microsPerDollar = 1_000_000;

// A count of US dollars in whole micros, the unit the ledger keeps, so a long run of small replies
// adds no drift. A positive amount counts at least one micro, so a reply that costs less than half
// a micro still adds to the count, and a limit that small never reads as already reached.
export function toMicros(dollars: number): number {
  const micros = Math.round(dollars * microsPerDollar);

  return dollars > 0 ? Math.max(1, micros) : micros;
}
