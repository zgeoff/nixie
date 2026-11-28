import type { Trust } from './types';

const ranks: Readonly<Record<Trust, number>> = { blocked: 0, known: 1, read: 2, act: 3, self: 4 };

// Where a level sits as levels rise: blocked, known, read, act. A destination with no entry counts
// as known, and self allows as much as act and more.
export function rankTrust(trust: Trust | null): number {
  return ranks[trust ?? 'known'];
}
