import type { Gold, PairedDifference, RankedTurn, Run } from './score-turns.ts';
import { buildPairedDifference, getShippedRun, scoreRanking, scoreServed } from './score-turns.ts';

export interface ScoreReport {
  lines: string[];
  report: Record<string, unknown>;
}

// Builds the two tables the score command prints, the ranking runs and the served sets, and the same
// scores as one object for its JSON report.
export function buildScoreReport(runs: Run[], results: Map<string, RankedTurn[]>, gold: Map<string, Gold>): ScoreReport {
  const report: Record<string, unknown> = {};
  const lines = [
    '| Run | Cases | Recall@3 | Recall@5 | Recall@10 | MRR | Best@5 | Recall@5 vs shipped | MRR vs shipped |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  const base = results.get(getShippedRun(runs, 'ranking').name) ?? [];

  for (const run of runs.filter((entry) => entry.kind === 'ranking')) {
    const ranked = results.get(run.name) ?? [];
    const score = scoreRanking(ranked, gold);
    const at5 = buildPairedDifference(ranked, base, gold, 'at5');
    const reciprocal = buildPairedDifference(ranked, base, gold, 'reciprocal');

    report[run.name] = { ...score, recallAt5Difference: at5, mrrDifference: reciprocal };
    lines.push(
      `| ${run.name} | ${score.cases} | ${score.recallAt3} | ${score.recallAt5} | ${score.recallAt10} | ${score.mrr} | ${score.bestAt5} | ${formatDifference(at5)} | ${formatDifference(reciprocal)} |`,
    );
  }

  lines.push(
    '',
    '| Run | Gold cases | Covered recall | Fresh cases | Fresh recall | Empty cases | Shown on empty | Empty with any | Precision | Noise served | Shown per turn | Fresh change | Shown on empty change |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );

  const servedBase = results.get(getShippedRun(runs, 'served').name) ?? [];

  for (const run of runs.filter((entry) => entry.kind === 'served')) {
    const ranked = results.get(run.name) ?? [];
    const score = scoreServed(ranked, gold);
    const shown = buildMean(ranked.map((entry) => entry.ranking.facts.length + entry.ranking.selves.length));
    const fresh = buildPairedDifference(ranked, servedBase, gold, 'fresh');
    const shownOnEmpty = buildPairedDifference(ranked, servedBase, gold, 'shownOnEmpty');

    report[run.name] = { ...score, shownPerTurn: shown, freshDifference: fresh, shownOnEmptyDifference: shownOnEmpty };
    lines.push(
      `| ${run.name} | ${score.goldCases} | ${score.coveredRecall} | ${score.freshCases} | ${score.freshRecall} | ${score.emptyCases} | ${score.shownOnEmpty} | ${score.emptyWithAny} | ${score.precision} | ${score.noiseServed} | ${shown} | ${formatDifference(fresh)} | ${formatDifference(shownOnEmpty)} |`,
    );
  }

  return { lines, report };
}

function formatDifference(difference: PairedDifference): string {
  return `${difference.mean} (${difference.low} to ${difference.high})`;
}

function buildMean(numbers: number[]): number {
  return numbers.length === 0 ? 0 : Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) / 100;
}
