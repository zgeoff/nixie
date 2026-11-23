// Where an item stands in the usage list: the time it last surfaced, null for never, and then the
// order it was created in.
export interface UsagePosition {
  readonly surfacedAtMs: number | null;
  readonly createdSequence: number;
}

// Orders the never-surfaced first, then the longest unsurfaced, with the older item first on a tie.
export function compareUsagePosition(left: UsagePosition, right: UsagePosition): number {
  if (left.surfacedAtMs === null || right.surfacedAtMs === null) {
    const byNever = Number(left.surfacedAtMs !== null) - Number(right.surfacedAtMs !== null);

    return byNever === 0 ? left.createdSequence - right.createdSequence : byNever;
  }

  return left.surfacedAtMs - right.surfacedAtMs || left.createdSequence - right.createdSequence;
}
