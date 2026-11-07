import type { Log } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMomentText } from './build-moment-text';
import { defaultMinSimilarity } from './default-min-similarity';
import { mergeRankings } from './merge-rankings';
import type { MomentTables } from './moment-types';
import type { MomentDetail } from './read-moment-detail';
import { readMomentDetail } from './read-moment-detail';
import type { MomentRow } from './read-moment-row';
import type { MomentIndexes } from './start-store-indexes';
import type { VectorMatch } from './start-vector-index';
import { updateMomentIndex } from './update-moment-index';

export interface MomentFindQuery {
  readonly query: string;
  readonly from: number | null;
  readonly to: number | null;
  readonly includeRetired: boolean;

  // the kept sequence the page before ended at, for a list by date
  readonly before: number | null;
  readonly limit: number;
}

export interface MomentMatch {
  readonly row: MomentRow;
  readonly title: string | null;
}

export interface MomentMatchPage {
  readonly matches: readonly MomentMatch[];
  readonly next: number | null;
}

export interface MomentSearchParts {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly moments: MomentIndexes;
}

const rankHeadroom = 5;

// A keyword search decrypts each candidate's text in process memory, because a full-text index on
// disk would keep a destroyed moment's words.
export async function readMomentMatches(
  parts: MomentSearchParts,
  query: MomentFindQuery,
): Promise<MomentMatchPage> {
  const words = query.query
    .split(/\s+/u)
    .map((word) => normalizeMatchWord(word))
    .filter((word) => word !== '');

  if (words.length === 0) {
    return readListPage(parts.log, query);
  }

  const limit = query.limit + rankHeadroom;

  const [keywordMatches, vectorMatches] = await Promise.all([
    readScoredMatches(parts.log, query, words, limit),
    readVectorMatches(parts, query, limit),
  ]);

  const ranked = mergeRankings(
    keywordMatches.map((match) => ({ itemID: match.row.moment_id, score: match.score })),
    vectorMatches.map((match) => ({ itemID: match.row.moment_id, similarity: match.similarity })),
  ).slice(0, query.limit);

  const titled = new Map(
    keywordMatches.map((match) => [match.row.moment_id, { row: match.row, title: match.title }]),
  );

  const rows = new Map(vectorMatches.map((match) => [match.row.moment_id, match.row]));

  const matches = await Promise.all(
    ranked.map(async (match) => {
      const keywordMatch = titled.get(match.itemID);

      if (keywordMatch !== undefined) {
        return keywordMatch;
      }

      return await readTitledMatch(parts.log, rows, match.itemID);
    }),
  );

  return { matches, next: null };
}

function normalizeMatchWord(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}

async function readListPage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: MomentFindQuery,
): Promise<MomentMatchPage> {
  const rows = await readCandidateRows(log, query, query.limit + 1);

  const page = rows.slice(0, query.limit);

  const details = await Promise.all(page.map((row) => readMomentDetail(log, row)));

  const last = page.at(-1);

  return {
    matches: page.map((row, index) => ({ row, title: details[index]?.title ?? null })),
    next: rows.length > query.limit && last !== undefined ? last.kept_sequence : null,
  };
}

function readCandidateRows(
  log: Pick<Log, 'writer'>,
  query: MomentFindQuery,
  limit: number | null,
): Promise<readonly MomentRow[]> {
  const states = query.includeRetired ? (['active', 'retired'] as const) : (['active'] as const);

  return log.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moments')
    .selectAll()
    .where('state', 'in', states)
    .$if(query.from !== null, (select) => select.where('kept_at', '>=', query.from ?? 0))
    .$if(query.to !== null, (select) => select.where('kept_at', '<', query.to ?? 0))
    .$if(query.before !== null, (select) => select.where('kept_sequence', '<', query.before ?? 0))
    .orderBy('kept_sequence', 'desc')
    .$if(limit !== null, (select) => select.limit(limit ?? 0))
    .execute();
}

interface ScoredMatch extends MomentMatch {
  readonly score: number;
}

const scanBatch = 100;

// Every candidate is scored, a batch at a time, so an old moment with the best match still ranks.
async function readScoredMatches(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: MomentFindQuery,
  words: readonly string[],
  limit: number,
): Promise<readonly ScoredMatch[]> {
  let best: readonly ScoredMatch[] = [];
  let before = query.before;

  for (;;) {
    const rows = await readCandidateRows(log, { ...query, before }, scanBatch);
    const details = await Promise.all(rows.map((row) => readMomentDetail(log, row)));

    const scored = rows.map((row, index) => ({
      row,
      title: details[index]?.title ?? null,
      score: countMatchedWords(details[index], words),
    }));

    best = [...best, ...scored.filter((entry) => entry.score > 0)]
      .toSorted((left, right) => right.score - left.score)
      .slice(0, limit);

    const last = rows.at(-1);

    if (rows.length < scanBatch || last === undefined) {
      return best;
    }

    before = last.kept_sequence;
  }
}

function countMatchedWords(detail: MomentDetail | undefined, words: readonly string[]): number {
  if (detail === undefined) {
    return 0;
  }

  const text = normalizeMatchWord(buildMomentText(detail));

  return words.filter((word) => text.includes(word)).length;
}

interface RowVectorMatch {
  readonly row: MomentRow;
  readonly similarity: number;
}

// The index holds every live moment, so the query's state and time filters apply to its matches.
async function readVectorMatches(
  parts: MomentSearchParts,
  query: MomentFindQuery,
  limit: number,
): Promise<readonly RowVectorMatch[]> {
  await updateMomentIndex(parts.log, parts.moments);

  const vectors = parts.moments.vectors;

  if (vectors === null) {
    return [];
  }

  const [matches, rows] = await Promise.all([
    vectors.readMatches(query.query, {
      limit: Number.MAX_SAFE_INTEGER,
      minSimilarity: defaultMinSimilarity,
    }),
    readCandidateRows(parts.log, query, null),
  ]);

  return collectRowMatches(matches ?? [], rows).slice(0, limit);
}

function collectRowMatches(
  matches: readonly VectorMatch[],
  rows: readonly MomentRow[],
): readonly RowVectorMatch[] {
  const candidates = new Map(rows.map((row) => [row.moment_id, row]));

  return matches.flatMap((match) => {
    const row = candidates.get(match.itemID);

    return row === undefined ? [] : [{ row, similarity: match.similarity }];
  });
}

async function readTitledMatch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  rows: ReadonlyMap<string, MomentRow>,
  momentID: string,
): Promise<MomentMatch> {
  const row = rows.get(momentID);

  invariant(row, `the ranking holds moment ${momentID}, which neither search returned`);

  const detail = await readMomentDetail(log, row);

  return { row, title: detail.title };
}
