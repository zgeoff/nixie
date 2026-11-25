const microsPerDollar = 1_000_000;

// Whether a count of US dollars has reached a limit, compared in whole micros, so that ten replies
// of 0.1 dollars reach a limit of 1 dollar.
export function isDollarLimitReached(spentDollars: number, limitDollars: number): boolean {
  return Math.round(spentDollars * microsPerDollar) >= Math.round(limitDollars * microsPerDollar);
}
