import { getShippedRun, type Run } from './score-turns.ts';

// The score counts a shown item the rater never saw as not needed, so the rating sample pools every
// served setting the score compares. Of the ranking settings, only the shipped one adds its top places.
export function pickPooledRuns(runs: Run[]): Run[] {
  return [getShippedRun(runs, 'ranking'), ...runs.filter((run) => run.kind === 'served')];
}
