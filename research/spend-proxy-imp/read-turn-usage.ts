// Runs in the preview's nixie container, which holds no package for it, so it parses by hand.
// Prints one JSON line per thread with the tokens its turn-ended records hold, summed the way the
// counting proxy counts them, and a last line with the totals.
// Usage: bun read-turn-usage.ts [database]
import { Database } from 'bun:sqlite';

export interface TurnUsage {
  readonly thread: string;
  readonly turns: number;
  readonly tokens: number;
}

export function readTurnUsage(db: Database): readonly TurnUsage[] {
  const rows = db
    .query<{ thread: string; payload: string }, []>(
      "select thread, payload from records where kind = 'model.turn_ended' order by sequence",
    )
    .all();

  const threads = collectThreadUsage(rows);

  return [
    ...threads,
    {
      thread: 'all',
      turns: threads.reduce((sum, thread) => sum + thread.turns, 0),
      tokens: threads.reduce((sum, thread) => sum + thread.tokens, 0),
    },
  ];
}

function collectThreadUsage(
  rows: readonly { readonly thread: string; readonly payload: string }[],
): readonly TurnUsage[] {
  const threads = new Map<string, TurnUsage>();

  for (const row of rows) {
    const known = threads.get(row.thread) ?? { thread: row.thread, turns: 0, tokens: 0 };

    threads.set(row.thread, {
      thread: row.thread,
      turns: known.turns + 1,
      tokens: known.tokens + parseTurnTokens(row.payload),
    });
  }

  return [...threads.values()];
}

const tokenFields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'] as const;

function parseTurnTokens(payload: string): number {
  const parsed: unknown = JSON.parse(payload);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('a model.turn_ended payload is not an object');
  }

  return tokenFields.reduce((sum, field) => {
    const value: unknown = Reflect.get(parsed, field);

    if (typeof value !== 'number') {
      throw new Error(`a model.turn_ended payload has no number in ${field}`);
    }

    return sum + value;
  }, 0);
}

if (import.meta.main) {
  const db = new Database(process.argv[2] ?? '/data/nixie.db', { readonly: true });

  for (const usage of readTurnUsage(db)) {
    console.log(JSON.stringify(usage));
  }
}
