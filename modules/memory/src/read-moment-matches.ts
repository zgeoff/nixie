import type { Log } from '@heynixie/log';
import type { MomentTables } from './moment-types';
import type { MomentDetail } from './read-moment-detail';
import { readMomentDetail } from './read-moment-detail';
import type { MomentRow } from './read-moment-row';

export interface MomentFindQuery {
  readonly words: readonly string[];
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

// A keyword search decrypts each candidate's text in process memory, because a full-text index on
// disk would keep a destroyed moment's words.
export async function readMomentMatches(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: MomentFindQuery,
): Promise<MomentMatchPage> {
  const words = query.words.map((word) => normalizeMatchWord(word)).filter((word) => word !== '');

  if (words.length === 0) {
    const rows = await readCandidateRows(log, query, query.limit + 1);

    const page = rows.slice(0, query.limit);

    const details = await Promise.all(page.map((row) => readMomentDetail(log, row)));

    const last = page.at(-1);

    return {
      matches: page.map((row, index) => ({ row, title: details[index]?.title ?? null })),
      next: rows.length > query.limit && last !== undefined ? last.kept_sequence : null,
    };
  }

  return { matches: await readScoredMatches(log, query, words), next: null };
}

function normalizeMatchWord(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('en-US').trim();
}

function readCandidateRows(
  log: Pick<Log, 'writer'>,
  query: MomentFindQuery,
  limit: number,
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
    .limit(limit)
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
): Promise<readonly MomentMatch[]> {
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
      .slice(0, query.limit);

    const last = rows.at(-1);

    if (rows.length < scanBatch || last === undefined) {
      return best.map((entry) => ({ row: entry.row, title: entry.title }));
    }

    before = last.kept_sequence;
  }
}

function countMatchedWords(detail: MomentDetail | undefined, words: readonly string[]): number {
  if (detail === undefined) {
    return 0;
  }

  const text = normalizeMatchWord(
    [detail.title, detail.note, ...detail.reflections.map((reflection) => reflection.text)]
      .filter((part) => part !== null)
      .join('\n'),
  );

  return words.filter((word) => text.includes(word)).length;
}
