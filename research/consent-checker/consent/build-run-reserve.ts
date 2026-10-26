// A run reserves the most its costliest call can cost unless it asks for more, and a reservation below
// that would let a crash undercount a call, so it is refused.
export function buildRunReserveUSD(
  requestedUSD: number | null,
  boundsUSD: readonly number[],
): number {
  const boundUSD = Math.max(0, ...boundsUSD);

  if (requestedUSD === null) {
    return boundUSD;
  }

  if (requestedUSD < boundUSD) {
    throw new Error(
      `a reservation of $${requestedUSD.toFixed(4)} is below $${boundUSD.toFixed(4)}, the most one call of this run can cost`,
    );
  }

  return requestedUSD;
}
