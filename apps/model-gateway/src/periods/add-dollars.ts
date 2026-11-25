const microsPerDollar = 1_000_000;

// The sum of two counts of US dollars, added in whole micros, so a long run of small replies adds
// no floating-point drift.
export function addDollars(firstDollars: number, secondDollars: number): number {
  const firstMicros = Math.round(firstDollars * microsPerDollar);
  const secondMicros = Math.round(secondDollars * microsPerDollar);

  return (firstMicros + secondMicros) / microsPerDollar;
}
