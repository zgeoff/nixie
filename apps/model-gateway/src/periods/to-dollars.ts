const microsPerDollar = 1_000_000;

export function toDollars(micros: number): number {
  return micros / microsPerDollar;
}
