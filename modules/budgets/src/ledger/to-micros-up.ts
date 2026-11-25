// Dollars from outside the ledger, as whole micros rounded up. The rounding to 3 decimals first
// drops float noise, so 0.41 dollars is 410000 micros and not 410001.
export function toMicrosUp(dollars: number): number {
  return Math.ceil(Number((dollars * 1_000_000).toFixed(3)));
}
