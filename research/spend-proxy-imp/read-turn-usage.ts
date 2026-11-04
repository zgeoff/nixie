// Prints one JSON line per thread with the tokens its turn-ended records hold, summed the way the
// counting proxy counts them, and a last line with the totals. It runs in the preview's nixie
// container, which holds no package for it, so run-spike.ts sends it there as one bundled file.
import { Database } from 'bun:sqlite';
// @boundaries-ignore a spike imports the code it measures
import { modelTurnEndedCodec } from '../../modules/models/src/model-turn-ended-codec.ts';

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

function parseTurnTokens(payload: string): number {
  const stored: unknown = JSON.parse(payload);
  const turn = modelTurnEndedCodec.parse(stored);

  return turn.inputTokens + turn.outputTokens + turn.cacheReadTokens + turn.cacheWriteTokens;
}

if (import.meta.main) {
  const db = new Database('/data/nixie.db', { readonly: true });

  for (const usage of readTurnUsage(db)) {
    console.log(JSON.stringify(usage));
  }
}
