// A lapse that the release before wrote carries no quiet time, so the quiet days count from it here.
export function pickQuietUntil(
  quietUntil: number | null,
  lapsedAt: number | null,
  quietMs: number,
): number | null {
  const sinceLapse = lapsedAt === null ? null : lapsedAt + quietMs;

  if (quietUntil === null) {
    return sinceLapse;
  }

  return sinceLapse === null ? quietUntil : Math.max(quietUntil, sinceLapse);
}
