import type { MemoryRef } from './types';

export function isCoreChanged(
  previous: readonly MemoryRef[],
  current: readonly MemoryRef[],
): boolean {
  const before = new Map(previous.map((ref) => [ref.itemID, ref.version]));

  return (
    previous.length !== current.length ||
    current.some((ref) => before.get(ref.itemID) !== ref.version)
  );
}
