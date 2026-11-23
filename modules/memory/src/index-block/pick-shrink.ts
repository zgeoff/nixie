import type { SubTopic } from './collect-topic-rows';
import { foldedLines } from './constants';
import type { RowState } from './types';

interface Shrink {
  readonly index: number;
  readonly state: RowState;
}

// The next change that makes the block smaller, or null when nothing is left to cut. It folds the
// open sub-topic with the most items, in any topic, until every sub-topic is folded. Only then does
// it fold a whole topic, the one with the most items. Then it drops the topic with the fewest items.
export function pickShrink(states: readonly RowState[]): Shrink | null {
  const live = states.flatMap((state, index) => (state.isDropped ? [] : [{ index, state }]));
  const open = live.filter((entry) => !entry.state.isFolded);
  const subFolds = open.flatMap((entry) => collectSubFolds(entry));

  // A topic of 3 items or fewer shows all of them when folded, so folding it saves nothing.
  const wholeFolds = open
    .filter((entry) => entry.state.row.count > foldedLines)
    .map((entry) => ({
      index: entry.index,
      state: { ...entry.state, isFolded: true },
      size: entry.state.row.count,
    }));

  const smallest = pickLast(live, (left, right) => left.state.row.count <= right.state.row.count);

  return (
    pickLast(subFolds, isBigger) ??
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

// The sub-topics of the topic that are still open.
function collectSubFolds(entry: LiveRow): readonly SizedShrink[] {
  const state = entry.state;

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
