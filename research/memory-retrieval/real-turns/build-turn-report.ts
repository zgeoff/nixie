import { buildScoreReport } from './build-score-report.ts';
import type { TurnCase } from './build-turn-cases.ts';
import { collectItemShows } from './collect-item-shows.ts';
import { collectWritingTurns } from './collect-writing-turns.ts';
import { countWords } from './count-words.ts';
import { isTechnicalTurn } from './is-technical-turn.ts';
import { pickHeldOutCases } from './pick-held-out-cases.ts';
import type { PlainRecord } from './read-plain-export.ts';
import { scoreBlocks } from './score-blocks.ts';
import type { RatedMessage } from './score-message-floors.ts';
import { scoreMessageFloors } from './score-message-floors.ts';
import type { Gold, RankedTurn, Run } from './score-turns.ts';
import { getShippedRun } from './score-turns.ts';
import { scoreWordOverlap } from './score-word-overlap.ts';

export interface TurnReportInput {
  chosen: TurnCase[];
  hybrid: TurnCase[];
  records: PlainRecord[];
  gold: Map<string, Gold>;
  labelled: number;
  runs: Run[];
  results: Map<string, RankedTurn[]>;
  pooledByCase: Map<string, Set<string>>;
  ratedMessages: RatedMessage[];
  excludedWords: string[];
  shortWords: number;
  heldOutSeed: number;
}

export interface TurnReport {
  lines: string[];
  report: Record<string, unknown>;
}

// Builds every score the score command prints and writes, from the labels and the ranking results.
export function buildTurnReport(input: TurnReportInput): TurnReport {
  const { chosen, gold, runs, results } = input;
  const scored = buildScoreReport(runs, results, gold);
  const heldOutIDs = pickHeldOutCases(
    chosen.map((turn) => turn.caseID),
    input.heldOutSeed,
  );
  const subsetReport = (isIn: (caseID: string) => boolean) =>
    buildScoreReport(runs, new Map([...results].map(([name, ranked]) => [name, ranked.filter((entry) => isIn(entry.caseID))])), gold);
  const technicalIDs = new Set(chosen.filter((turn) => isTechnicalTurn(turn)).map((turn) => turn.caseID));
  const writingIDs = collectWritingTurns(input.hybrid, input.records);
  const kinds = {
    technical: subsetReport((caseID) => technicalIDs.has(caseID)),
    chat: subsetReport((caseID) => !technicalIDs.has(caseID)),
    writing: subsetReport((caseID) => writingIDs.has(caseID)),
    notWriting: subsetReport((caseID) => !writingIDs.has(caseID)),
  };
  const shippedServed = new Map((results.get(getShippedRun(runs, 'served').name) ?? []).map((entry) => [entry.caseID, [...entry.ranking.facts, ...entry.ranking.selves]]));
  const shippedTop = new Map((results.get(getShippedRun(runs, 'ranking').name) ?? []).map((entry) => [entry.caseID, entry.ranking.facts.slice(0, 5)]));
  const wordOverlap = {
    served: scoreWordOverlap(chosen, gold, shippedServed, input.excludedWords),
    top5: scoreWordOverlap(chosen, gold, shippedTop, input.excludedWords),
  };
  const selection = subsetReport((caseID) => !heldOutIDs.has(caseID));
  const heldOut = subsetReport((caseID) => heldOutIDs.has(caseID));
  const shortIDs = new Set(chosen.filter((turn) => countWords(turn.query) <= input.shortWords).map((turn) => turn.caseID));
  const shortScored = subsetReport((caseID) => shortIDs.has(caseID));
  const blocks = {
    all: scoreBlocks(chosen, gold),
    technical: scoreBlocks(
      chosen.filter((turn) => technicalIDs.has(turn.caseID)),
      gold,
    ),
    chat: scoreBlocks(
      chosen.filter((turn) => !technicalIDs.has(turn.caseID)),
      gold,
    ),
    short: scoreBlocks(
      chosen.filter((turn) => shortIDs.has(turn.caseID)),
      gold,
    ),
    other: scoreBlocks(
      chosen.filter((turn) => !shortIDs.has(turn.caseID)),
      gold,
    ),
  };
  const itemShows = collectItemShows(input.hybrid, gold, input.pooledByCase, [3, 5, 10]);
  const messageFloors = scoreMessageFloors(input.ratedMessages, [0.38, 0.42, 0.46, 0.5, 0.55, 0.6]);
  const writing = chosen.filter((turn) => writingIDs.has(turn.caseID)).length;

  return {
    lines: [
      `turns ${chosen.length}, labelled ${input.labelled}, short ${shortIDs.size}\n`,
      scored.lines.join('\n'),
      `\nshort turns only\n\n${shortScored.lines.join('\n')}`,
      ...Object.entries(kinds).map(([kind, report]) => `\n${kind} turns\n\n${report.lines.join('\n')}`),
      JSON.stringify({ technical: technicalIDs.size, writing, wordOverlap }, null, 2),
      `\nselection half, ${chosen.length - heldOutIDs.size} turns\n\n${selection.lines.join('\n')}`,
      `\nheld-out half, ${heldOutIDs.size} turns\n\n${heldOut.lines.join('\n')}`,
      `\nshown blocks\n\n${JSON.stringify(blocks, null, 2)}`,
      `\npast-message similarity floors\n\n${JSON.stringify(messageFloors, null, 2)}`,
      `\nitems by turns retrieved\n\n${JSON.stringify({ ...itemShows, items: itemShows.items.slice(0, 15) }, null, 2)}`,
    ],
    report: {
      turns: chosen.length,
      labelled: input.labelled,
      ...scored.report,
      short: shortScored.report,
      selection: selection.report,
      heldOut: heldOut.report,
      kinds: Object.fromEntries(Object.entries(kinds).map(([kind, report]) => [kind, report.report])),
      wordOverlap,
      blocks,
      messageFloors,
      itemShows,
    },
  };
}
