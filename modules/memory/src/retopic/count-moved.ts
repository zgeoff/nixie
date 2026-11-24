import type { MovedCounts, RetopicMove } from './types';

export function countMoved(moves: readonly RetopicMove[]): MovedCounts {
  const retired = moves.filter((move) => move.state === 'retired').length;

  return { active: moves.length - retired, retired };
}
