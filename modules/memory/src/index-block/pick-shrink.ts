import type { SubTopic } from './collect-topic-rows';
import { foldedLines } from './constants';
import type { RowState } from './types';

interface Shrink {
  readonly index: number;
  readonly state: RowState;
}

// The next change that makes the block smaller, or null when nothing is left to cut. It folds the
// sub-topic, or the topic with no sub-topic, that has the most items. A topic with sub-topics folds
// only once each of its sub-topics is folded. Then it drops the topic with the fewest items.
export function pickShrink(states: readonly RowState[]): Shrink | null {
  const live = states.flatMap((state, index) => (state.isDropped ? [] : [{ index, state }]));
  const open = live.filter((entry) => !entry.state.isFolded);

  // A topic of 3 items or fewer shows all of them when folded, so folding it saves nothing.
  const folds = open
    .flatMap((entry) => collectFirstFolds(entry))
    .filter((fold) => fold.size > foldedLines);

  const wholeFolds = open
    .filter((entry) => entry.state.row.count > foldedLines)
    .map((entry) => ({
      index: entry.index,
      state: { ...entry.state, isFolded: true },
      size: entry.state.row.count,
    }));

  const smallest = pickLast(live, (left, right) => left.state.row.count <= right.state.row.count);

  return (
    pickLast(folds, isBigger) ??
    pickLast(wholeFolds, isBigger) ??
    (smallest === null
      ? null
      : { index: smallest.index, state: { ...smallest.state, isDropped: true } })
  );
}

interface LiveRow {
  readonly index: number;
  readonly state: RowState;
}

interface SizedShrink extends Shrink {
  readonly size: number;
}

// The sub-topics that fold first, or the topic itself when it has none.
function collectFirstFolds(entry: LiveRow): readonly SizedShrink[] {
  const state = entry.state;

  if (state.row.subTopics.length === 0) {
    return [{ index: entry.index, state: { ...state, isFolded: true }, size: state.row.count }];
  }

  return state.row.subTopics
    .filter((sub) => isSubOpen(state, sub))
    .map((sub) => ({
      index: entry.index,
      state: { ...state, foldedSubs: [...state.foldedSubs, sub.name] },
      size: sub.count,
    }));
}

function isSubOpen(state: RowState, sub: SubTopic): boolean {
  return !state.foldedSubs.includes(sub.name);
}

// The last entry that no other entry beats, so a tie goes to the later one.
function pickLast<T>(entries: readonly T[], isBetter: (left: T, right: T) => boolean): T | null {
  let best: T | null = null;

  for (const entry of entries) {
    if (best === null || isBetter(entry, best)) {
      best = entry;
    }
  }

  return best;
}

function isBigger(left: SizedShrink, right: SizedShrink): boolean {
  return left.size >= right.size;
}
