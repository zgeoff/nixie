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

const scanLimit = 500;

// A keyword search decrypts each candidate's text in process memory, because a full-text index on
// disk would keep a destroyed moment's words.
export async function readMomentMatches(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: MomentFindQuery,
): Promise<MomentMatchPage> {
  const words = query.words.map((word) => normalizeMatchWord(word)).filter((word) => word !== '');
  const candidateLimit = words.length === 0 ? query.limit + 1 : scanLimit;

  const rows = await readCandidateRows(log, query, candidateLimit);

  if (words.length === 0) {
    const page = rows.slice(0, query.limit);

    const details = await Promise.all(page.map((row) => readMomentDetail(log, row)));

    const last = page.at(-1);

    return {
      matches: page.map((row, index) => ({ row, title: details[index]?.title ?? null })),
      next: rows.length > query.limit && last !== undefined ? last.kept_sequence : null,
    };
  }

  const details = await Promise.all(rows.map((row) => readMomentDetail(log, row)));

  const scored = rows
    .map((row, index) => ({
      row,
      detail: details[index],
      score: countMatchedWords(details[index], words),
    }))
    .filter((entry) => entry.score > 0)
    .toSorted((left, right) => right.score - left.score);

  return {
    matches: scored
      .slice(0, query.limit)
      .map((entry) => ({ row: entry.row, title: entry.detail?.title ?? null })),
    next: null,
  };
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
